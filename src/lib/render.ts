/**
 * Browser-safe rendering.
 *
 * The dvdrw lib's high-level dvd() function pulls in a CDExecutor whose shell
 * handler imports node:child_process — that explodes in a browser bundle. We
 * sidestep it by using only the lib's pure primitives (parseCDScript, vterminal
 * grid ops, coalesce, createFilmstripSVG) and walking commands ourselves.
 *
 * Shell-flavored commands (Output, Source, Wait, Screenshot, Require) are
 * skipped here with a soft notice so the user can still preview their typing
 * animation. Running commands for real is the WebContainers job.
 */

import {
  coalesce,
  createFilmstripSVG,
  createGridState,
  emitAnimated,
  generateFramesFromRecording,
  optimizeSvg,
  parseCDScript,
  parseCastFile,
  processInput,
  themes as builtinThemes,
} from 'dvdrw';
import type {
  AnimationOptions,
  CDCommand,
  FrameData,
  Gradient,
  GridState,
  Theme,
} from 'dvdrw';
import type { RenderOptions } from '../stores/optionsStore';
import { useCustomThemesStore, type CustomTheme } from '../stores/customThemesStore';
import type { RenderResult } from './types';

/**
 * Parse `gradient(#a, #b[:direction[:reverse]])` syntax into the Gradient
 * shape the low-level emitters expect. Mirrors shellfie's parseGradient
 * (which `dvdrw`'s high-level `dvd()` API runs internally) — we duplicate
 * the parser here because our `buildAnimation` calls the emitters
 * directly and they assume the background has already been parsed.
 * Anything that isn't gradient syntax (a hex string, undefined) is
 * passed through unchanged.
 */
const parseBackground = (
  value: string | undefined,
): string | Gradient | undefined => {
  if (!value) return undefined;
  if (!value.startsWith('gradient(')) return value;
  const match = value.match(/^gradient\(([^)]+)\)$/);
  if (!match) return value;
  const [colorsPart, ...options] = match[1].split(':');
  const colors = colorsPart
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
  if (colors.length === 0) return value;
  const gradient: Gradient = { type: 'gradient', colors };
  for (const opt of options) {
    const t = opt.trim().toLowerCase();
    if (t === 'horizontal' || t === 'vertical' || t === 'diagonal') {
      gradient.direction = t;
    } else if (t === 'reverse' || t === 'reversed') {
      gradient.reverse = true;
    }
  }
  return gradient;
};

const CHAR_WIDTH_RATIO = 0.6;
const DEFAULT_TYPING_SPEED_MS = 50;

/**
 * Resolve a theme id to a Theme object. Falls through to the customThemes
 * store for `custom-*` ids saved via the theme editor or auto-promoted
 * from inline `Set Theme {json}` directives. Without this lookup the
 * in-page mobile renderer ignored every custom theme and painted dark.
 */
const resolveTheme = (name: string): Theme => {
  const themeMap = builtinThemes as unknown as Record<string, Theme>;
  if (themeMap[name]) return themeMap[name];
  if (name.startsWith('custom-')) {
    const found = useCustomThemesStore
      .getState()
      .themes.find((t) => t.id === name);
    if (found) return customThemeToTheme(found);
  }
  return themeMap.dark;
};

const customThemeToTheme = (t: CustomTheme): Theme => {
  // CustomTheme already mirrors the dvd Theme shape — we just strip the
  // app-only id/name fields to hand a clean Theme to the emitters.
  const { id: _id, name: _name, ...colors } = t;
  void _id;
  void _name;
  return colors as unknown as Theme;
};

interface InterpreterContext {
  state: GridState;
  frames: FrameData[];
  theme: Theme;
  time: number;
  cursorVisible: boolean;
}

const captureFrame = (ctx: InterpreterContext) => {
  const rows = coalesce(ctx.state, ctx.theme);
  ctx.frames.push({
    rows,
    cursor: { ...ctx.state.cursor },
    cursorVisible: ctx.cursorVisible,
    timestamp: ctx.time,
  });
};

const writeAndCapture = (ctx: InterpreterContext, input: string, advanceMs = 0) => {
  ctx.state = processInput(ctx.state, input);
  ctx.time += advanceMs;
  captureFrame(ctx);
};

const repeat = (count: number | undefined, fn: () => void) => {
  const n = Math.max(1, count ?? 1);
  for (let i = 0; i < n; i++) fn();
};

const KEY_TO_INPUT: Record<string, string> = {
  Enter: '\r\n',
  Tab: '\t',
  Space: ' ',
  Backspace: '\b \b',
  Left: '\x1b[D',
  Right: '\x1b[C',
  Up: '\x1b[A',
  Down: '\x1b[B',
};

/**
 * Optional shell backend used by `interpretAsync`. When provided, a
 * `Type "…"` + `Enter` sequence is treated as a real command — the typed
 * buffer is sent to the executor, and stdout is injected into the
 * frame stream as if a real shell printed it. Used by the mobile runner
 * path, which boots a WebContainer with zero deps and uses it only as
 * a shell sandbox; the actual SVG synthesis stays in-page so we don't
 * have to install dvdrw inside the container.
 */
export interface ShellExecutor {
  run: (command: string) => Promise<string>;
}

/**
 * Translate the bash-style backslash escapes the dvd CLI accepts inside
 * quoted strings ("\\e", "\\x1b", "\\n", "\\t") into the actual control
 * characters. Mirrors `parseEscapes` in `dvd/src/executor/types.ts`. The
 * env-var expansion the desktop CLI also does isn't applicable in the
 * browser, so we skip it.
 */
const parseEscapes = (value: string): string =>
  value
    .replace(/\\e/g, '\x1b')
    .replace(/\\x1b/g, '\x1b')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t');

/** Visible (rendered-cell) length of a prompt, after stripping SGR escapes. */
const visibleLength = (s: string): number =>
  s.replace(/\x1b\[[0-9;]*m/g, '').length;

/**
 * Walk the script's `Set` directives and pluck the last `PromptPrefix`
 * (last write wins, same as dvd-cli). Falls back to dvd's default purple
 * `❯ ` prompt when the script doesn't set one.
 */
const resolvePromptPrefix = (commands: CDCommand[]): string => {
  let value: string | null = null;
  for (const cmd of commands) {
    if (cmd.type === 'Set' && cmd.setting === 'PromptPrefix') {
      value = cmd.value;
    }
  }
  return parseEscapes(value ?? '\\x1b[95m❯ \\x1b[0m');
};

/**
 * Async sibling of `interpret` — same state machine, but a Type+Enter
 * sequence actually runs the typed command through the supplied
 * `ShellExecutor` and writes the captured stdout into the terminal grid.
 * Used by the mobile runner so scripts can do `echo hi`, `ls`, etc., even
 * though dvd isn't installed in the container.
 */
export const interpretAsync = async (
  commands: CDCommand[],
  termCols: number,
  termRows: number,
  theme: Theme,
  executor: ShellExecutor,
  onProgress?: (done: number, total: number) => void,
  initialCursorVisible = true,
): Promise<{ frames: FrameData[]; notices: string[] }> => {
  const ctx: InterpreterContext = {
    state: createGridState(termCols, termRows),
    frames: [],
    theme,
    time: 0,
    cursorVisible: initialCursorVisible,
  };
  captureFrame(ctx);

  const notices: string[] = [];
  const skip = (label: string) => notices.push(label);

  // Buffer of characters typed since the last Enter — fed to the executor
  // verbatim when the user "presses Enter" in the script. Backspace
  // pops from this buffer so editing typed text doesn't desync.
  let typed = '';
  let executedCount = 0;
  const totalEnters = commands.filter(
    (c) => c.type === 'Key' && c.key === 'Enter',
  ).length;

  // Prompt prefix matches dvd's executor: honour `Set PromptPrefix` from
  // the script, falling through to the purple `❯ ` default. `PROMPT_VW`
  // is the cell width of the rendered prompt (after stripping SGRs), used
  // by Ctrl+A / Ctrl+E to position the cursor correctly when the prompt
  // contains color escapes.
  const PROMPT = resolvePromptPrefix(commands);
  const PROMPT_VW = visibleLength(PROMPT);
  const writePrompt = () => writeAndCapture(ctx, PROMPT, 0);
  writePrompt();

  for (const cmd of commands) {
    switch (cmd.type) {
      case 'Type': {
        const speed = cmd.speed ?? DEFAULT_TYPING_SPEED_MS;
        for (const char of cmd.text) {
          typed += char;
          writeAndCapture(ctx, char, speed);
        }
        break;
      }
      case 'Key': {
        if (cmd.key === 'Enter') {
          writeAndCapture(ctx, '\r\n', 80);
          const command = typed.trim();
          typed = '';
          if (command) {
            try {
              const output = await executor.run(command);
              if (output) {
                // Normalize lone \n to \r\n so the terminal grid advances
                // both rows and resets the column — bash output from
                // WebContainer is line-feed only.
                const normalized = output.replace(/\r?\n/g, '\r\n');
                writeAndCapture(ctx, normalized, 0);
              }
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              writeAndCapture(ctx, `\x1b[31m${message}\x1b[0m\r\n`, 0);
            }
            executedCount += 1;
            onProgress?.(executedCount, totalEnters);
          }
          writePrompt();
        } else if (cmd.key === 'Backspace') {
          repeat(cmd.count, () => {
            typed = typed.slice(0, -1);
            writeAndCapture(ctx, '\b \b', 80);
          });
        } else {
          const input = KEY_TO_INPUT[cmd.key];
          if (input) repeat(cmd.count, () => writeAndCapture(ctx, input, 80));
        }
        break;
      }
      case 'Shortcut': {
        // Common readline shortcuts. Each one collapses to a single
        // terminal-escape write so the change lands in one frame
        // instead of animating cell-by-cell — Ctrl+U shouldn't look
        // like the user mashed Backspace.
        const k = cmd.key.toLowerCase();
        if (cmd.ctrl && k === 'u') {
          // \r moves cursor to column 0; \x1b[K clears from there to
          // the end of the line; then we re-emit the prompt so the
          // cursor lands right after it. Emitted as one string → one
          // frame, no animation.
          typed = '';
          writeAndCapture(ctx, `\r\x1b[K${PROMPT}`, 0);
        } else if (cmd.ctrl && k === 'c') {
          typed = '';
          writeAndCapture(ctx, `^C\r\n${PROMPT}`, 0);
        } else if (cmd.ctrl && k === 'l') {
          // Clear screen + home cursor + redraw prompt + the partial
          // typed buffer if any (matches real shell behaviour).
          writeAndCapture(ctx, `\x1b[2J\x1b[H${PROMPT}${typed}`, 0);
        } else if (cmd.ctrl && k === 'a' && typed.length > 0) {
          // Cursor to start of line, then move right past the prompt.
          writeAndCapture(ctx, `\r\x1b[${PROMPT_VW}C`, 0);
        } else if (cmd.ctrl && k === 'e' && typed.length > 0) {
          // Cursor to end of line: CR, then right past prompt + typed.
          writeAndCapture(
            ctx,
            `\r\x1b[${PROMPT_VW + typed.length}C`,
            0,
          );
        }
        break;
      }
      case 'Sleep':
        ctx.time += cmd.duration;
        captureFrame(ctx);
        break;
      case 'Hide':
        ctx.cursorVisible = false;
        captureFrame(ctx);
        break;
      case 'Show':
        ctx.cursorVisible = true;
        captureFrame(ctx);
        break;
      case 'Comment':
      case 'Set':
      case 'Env':
      case 'Require':
      case 'Copy':
      case 'Paste':
      case 'Output':
        skip('Output (file output — preview only)');
        break;
      case 'Source':
        skip(`Source ${cmd.file} (sourced scripts not supported in mobile preview)`);
        break;
      case 'Wait':
        skip('Wait (depends on real shell output — using fixed delay)');
        ctx.time += 500;
        captureFrame(ctx);
        break;
      case 'Screenshot':
        skip('Screenshot (only meaningful in CLI runs)');
        break;
    }
  }

  return { frames: ctx.frames, notices: Array.from(new Set(notices)) };
};

/**
 * Walk a parsed CDScript producing frameData. Returns the frames plus any
 * notices about commands we skipped (so the UI can surface them).
 */
const interpret = (
  commands: CDCommand[],
  termCols: number,
  termRows: number,
  theme: Theme,
): { frames: FrameData[]; notices: string[] } => {
  const ctx: InterpreterContext = {
    state: createGridState(termCols, termRows),
    frames: [],
    theme,
    time: 0,
    cursorVisible: true,
  };

  // Initial frame so the preview is never empty.
  captureFrame(ctx);

  const notices: string[] = [];
  const skip = (label: string) => notices.push(label);

  for (const cmd of commands) {
    switch (cmd.type) {
      case 'Type': {
        const speed = cmd.speed ?? DEFAULT_TYPING_SPEED_MS;
        for (const char of cmd.text) {
          writeAndCapture(ctx, char, speed);
        }
        break;
      }
      case 'Key': {
        const input = KEY_TO_INPUT[cmd.key];
        if (!input) break;
        repeat(cmd.count, () => writeAndCapture(ctx, input, 80));
        break;
      }
      case 'Sleep': {
        ctx.time += cmd.duration;
        captureFrame(ctx);
        break;
      }
      case 'Hide':
        ctx.cursorVisible = false;
        captureFrame(ctx);
        break;
      case 'Show':
        ctx.cursorVisible = true;
        captureFrame(ctx);
        break;
      case 'Comment':
      case 'Set':
      case 'Env':
      case 'Require':
        // Settings are picked up from the options store; comments are noise.
        break;
      case 'Output':
        skip('Output (writes to file — only meaningful in CLI runs)');
        break;
      case 'Source':
        skip(`Source ${cmd.file} (shell scripts run only via WebContainers)`);
        break;
      case 'Wait':
        skip('Wait (depends on real shell output)');
        break;
      case 'Screenshot':
        skip('Screenshot (only meaningful in CLI runs)');
        break;
      case 'Copy':
      case 'Paste':
        // Clipboard ops have no preview-time effect.
        break;
      case 'Shortcut':
        // Ctrl+L is the one shortcut the sync (no-shell) preview can
        // honour visually — clears the screen via the standard CSI
        // escape. The line-editing shortcuts (Ctrl+U/C/A/E) only make
        // sense when there's a typed buffer + shell loop (see
        // `interpretAsync`).
        if (cmd.ctrl && cmd.key.toLowerCase() === 'l') {
          writeAndCapture(ctx, '\x1b[2J\x1b[H', 80);
        }
        break;
    }
  }

  return { frames: ctx.frames, notices: Array.from(new Set(notices)) };
};

const buildAnimationOptions = (opts: RenderOptions): AnimationOptions => ({
  fps: opts.fps,
  loop: opts.loop,
  loopStyle: opts.loopStyle,
  pauseAtEnd: opts.pauseAtEnd,
});

const computeDimensions = (
  frames: FrameData[],
  options: RenderOptions,
): { width: number; height: number; cols: number; rows: number } => {
  let maxCol = 0;
  let maxRow = 0;
  for (const frame of frames) {
    for (const row of frame.rows) {
      for (const span of row) {
        if (span.row > maxRow) maxRow = span.row;
        const endCol = span.col + span.text.trimEnd().length;
        if (endCol > maxCol) maxCol = endCol;
      }
    }
    if (frame.cursor) {
      if (frame.cursor.row > maxRow) maxRow = frame.cursor.row;
      if (frame.cursor.col > maxCol) maxCol = frame.cursor.col;
    }
  }

  const cols = Math.max(40, maxCol + 2);
  const rows = Math.max(8, maxRow + 2);
  const charWidth = options.fontSize * CHAR_WIDTH_RATIO;
  const lineHeightPx = options.fontSize * options.lineHeight;
  const headerHeight = options.template === 'minimal' ? 0 : 40;

  const width = Math.ceil(cols * charWidth + options.padding * 2);
  const height = Math.ceil(rows * lineHeightPx + headerHeight + options.padding * 2);

  return { width, height, cols, rows };
};

const buildAnimation = (
  frames: FrameData[],
  options: RenderOptions,
  theme: Theme,
): RenderResult => {
  if (frames.length === 0) {
    throw new Error('No frames to render. Add some commands or recording events.');
  }

  const { width, height } = computeDimensions(frames, options);
  const charWidth = options.fontSize * CHAR_WIDTH_RATIO;
  const lineHeightPx = options.fontSize * options.lineHeight;
  const headerHeight = options.template === 'minimal' ? 0 : 40;

  let svg: string;

  // Background may be either a raw hex (e.g. "#1e1e2e") or the gradient
  // syntax dvdrw's high-level API accepts (`gradient(#a, #b:vertical)`).
  // Low-level emitters want it pre-parsed; if we hand them the raw
  // gradient string they bail and paint nothing — which is the "black
  // background" the user was seeing.
  const background = parseBackground(options.background);

  if (options.engine === 'smil') {
    const result = emitAnimated(frames, {
      theme,
      template: options.template,
      width,
      height,
      fontSize: options.fontSize,
      title: options.title,
      watermark: options.watermark,
      lineHeight: lineHeightPx,
      charWidth,
      letterSpacing: options.letterSpacing || undefined,
      padding: options.padding,
      borderRadius: options.borderRadius,
      borderColor: options.borderColor,
      borderWidth: options.borderWidth || undefined,
      headerHeight,
      cursorStyle: options.cursorStyle,
      cursorColor: options.cursorColor,
      cursorBlink: options.cursorBlink,
      background,
      backgroundPadding: options.backgroundPadding,
      backgroundRadius: options.backgroundRadius,
      fps: options.fps,
      loop: options.loop,
      pauseAtEnd: options.pauseAtEnd,
    });
    svg = result.svg;
  } else {
    svg = createFilmstripSVG(
      {
        frameData: frames,
        theme,
        width,
        height,
        fontSize: options.fontSize,
        template: options.template,
        title: options.title,
        watermark: options.watermark,
        lineHeight: lineHeightPx,
        charWidth,
        letterSpacing: options.letterSpacing || undefined,
        padding: options.padding,
        borderRadius: options.borderRadius,
        borderColor: options.borderColor,
        borderWidth: options.borderWidth || undefined,
        headerHeight,
        cursorStyle: options.cursorStyle,
        cursorColor: options.cursorColor,
        cursorBlink: options.cursorBlink,
        background,
        backgroundPadding: options.backgroundPadding,
        backgroundRadius: options.backgroundRadius,
        customGlyphs: true,
      },
      buildAnimationOptions(options),
    );
  }

  if (options.optimize) {
    svg = optimizeSvg(svg);
  }

  const lastTs = frames[frames.length - 1].timestamp;

  return {
    svg,
    width,
    height,
    frameCount: frames.length,
    durationMs: lastTs,
  };
};

export interface ScriptRenderInput {
  kind: 'script';
  source: string;
}

export interface CastRenderInput {
  kind: 'cast';
  source: string;
}

export type RenderInput = ScriptRenderInput | CastRenderInput;

export interface RenderOutput extends RenderResult {
  notices: string[];
}

/**
 * Async variant of `renderInput` for the mobile path: walks the script
 * with a ShellExecutor so typed commands actually run inside a
 * WebContainer (no dvd CLI installed there), then synthesizes the SVG
 * in-page using the same primitives.
 */
export const renderScriptAsync = async (
  source: string,
  options: RenderOptions,
  executor: ShellExecutor,
  onProgress?: (done: number, total: number) => void,
): Promise<RenderOutput> => {
  const theme = resolveTheme(options.theme);
  const script = parseCDScript(source);
  const charWidth = options.fontSize * CHAR_WIDTH_RATIO;
  const lineHeightPx = options.fontSize * options.lineHeight;
  const termCols = Math.max(40, Math.floor(800 / charWidth));
  const termRows = Math.max(8, Math.floor(420 / lineHeightPx));

  const { frames, notices } = await interpretAsync(
    script.commands,
    termCols,
    termRows,
    theme,
    executor,
    onProgress,
    options.cursorVisible,
  );
  const result = buildAnimation(frames, options, theme);
  return { ...result, notices };
};

export const renderInput = (
  input: RenderInput,
  options: RenderOptions,
): RenderOutput => {
  const theme = resolveTheme(options.theme);

  if (input.kind === 'script') {
    const script = parseCDScript(input.source);
    const charWidth = options.fontSize * CHAR_WIDTH_RATIO;
    const lineHeightPx = options.fontSize * options.lineHeight;
    const termCols = Math.max(40, Math.floor(800 / charWidth));
    const termRows = Math.max(8, Math.floor(420 / lineHeightPx));

    const { frames, notices } = interpret(script.commands, termCols, termRows, theme);
    const result = buildAnimation(frames, options, theme);
    return { ...result, notices };
  }

  const recording = parseCastFile(input.source);
  const frames = generateFramesFromRecording(recording, theme);
  const result = buildAnimation(frames, options, theme);
  return { ...result, notices: [] };
};

export { resolveTheme };
