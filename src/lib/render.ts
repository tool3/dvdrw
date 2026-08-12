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
  detectAnimationType,
  emitAnimated,
  generateFramesFromRecording,
  optimizeSvg,
  parseCDScript,
  parseCastFile,
  planVideo,
  processInput,
  splitIntoFrames,
  themes as builtinThemes,
} from 'dvdrw';
import type {
  AnimationOptions,
  AnimationType,
  CDCommand,
  EmitterOptions,
  FrameData,
  Gradient,
  GridState,
  Theme,
  VideoPlan,
  VideoQuality,
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
 * Resolve a theme id to a Theme object. Custom themes can be passed in
 * explicitly (so this function is safe to call from a Web Worker, where
 * the zustand store isn't reachable). On the main thread, the store
 * fallback below kicks in when callers don't pass `customThemes`.
 */
const resolveTheme = (
  name: string,
  customThemes: CustomTheme[] = [],
): Theme => {
  const themeMap = builtinThemes as unknown as Record<string, Theme>;
  if (themeMap[name]) return themeMap[name];
  if (name.startsWith('custom-')) {
    const found =
      customThemes.find((t) => t.id === name) ??
      // Main-thread fallback: read directly from the store when the
      // caller didn't bother passing the list. Workers must always
      // pass it because the store doesn't exist in their realm.
      (typeof window === 'undefined'
        ? undefined
        : useCustomThemesStore.getState().themes.find((t) => t.id === name));
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
export interface ShellRunResult {
  /** Combined stdout+stderr, escape sequences intact. */
  output: string;
  /**
   * Wall-clock milliseconds between the command's first and last output
   * chunk. Animated programs (chartscii `-e`, lolcat, spinners) pace their
   * own redraws, and that pacing only exists in the arrival times — the
   * concatenated buffer has no timing in it at all. `writeShellOutput`
   * spreads the detected frames across this span so the SVG plays back at
   * the speed the command actually ran. Omit (or 0) to fall back to a
   * synthetic 30fps.
   */
  outputSpanMs?: number;
}

export interface ShellExecutor {
  /** Returning a bare string is still supported; it just forfeits real
   *  animation timing (see `ShellRunResult.outputSpanMs`). */
  run: (command: string) => Promise<string | ShellRunResult>;
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

/* ------------------------------------------------------------------ */
/*                    Animated shell output → frames                  */
/* ------------------------------------------------------------------ */
/* A command's output reaches us as one concatenated string, so an     */
/* in-place animation (chartscii -e redrawing with CSI A, lolcat with  */
/* ESC 8, anything clearing with ESC c) used to land in a single       */
/* `processInput` call: the virtual terminal faithfully replayed every */
/* rewind-and-redraw at once and we captured only the end state — a    */
/* static final chart. The container console looked animated because   */
/* it repaints per arriving chunk; the SVG never got the chance.       */
/*                                                                     */
/* So we split the blob back into the frames the program intended and  */
/* paint them one at a time, each its own captured frame. The rewind   */
/* is driven by us rather than by the program's escapes: park at the   */
/* row where the output began, erase everything below, draw the frame. */
/* That makes all three rewind dialects behave identically and keeps   */
/* the prompt above the output untouched.                              */
/* ------------------------------------------------------------------ */

/** Rewind dialects we replay frame-by-frame. `clear-line` is deliberately
 *  absent: a bare `\x1b[2K` shows up in plenty of non-animated output
 *  (npm, ora one-shots), and splitting on it would shred static logs into
 *  bogus frames. This mirrors `isAnimatedOutput` in dvd's shell-recorder. */
const ANIMATED_TYPES: ReadonlySet<AnimationType> = new Set<AnimationType>([
  'terminal-reset',
  'cursor-up',
  'cursor-restore',
]);

const MIN_ANIMATION_FRAME_MS = 16;
const MAX_ANIMATION_FRAME_MS = 1000;
const DEFAULT_ANIMATION_FRAME_MS = 1000 / 30;

/** Ceiling on frames contributed by one command. Each frame is a full grid
 *  coalesce plus its own slice of SVG, so an animation that runs for many
 *  seconds at 30fps would bloat the output for no visible gain. */
const MAX_ANIMATION_FRAMES = 240;

/**
 * Escapes that only make sense while the program owns the whole screen.
 * Replayed into our shared grid they'd fight the anchored redraw below, or
 * wipe the prompt sitting above the output:
 *   - `\x1b[?25l/h` cursor visibility — we track that on the context.
 *   - `\x1b7` / `\x1b8` save/restore — would jump to a stale saved row.
 *   - `\x1bc` full reset — would blow away everything, prompt included.
 *   - `\x1b[2J` / `\x1b[3J` erase-display — same, minus the state reset.
 * The separator escapes themselves are already gone: `splitIntoFrames`
 * consumed them.
 */
const LIVE_CONTROL_RE = /\x1b\[\?25[lh]|\x1b\[[23]J|\x1b[78c]/g;

/** Every escape sequence — measurement only, never used for painting. */
const ANY_ESCAPE_RE = /\x1b\[[0-9;?]*[@-~]|\x1b[()][A-B0-9]|\x1b./g;

/** Bash output is line-feed only; the grid wants CRLF. */
const normalizeNewlines = (s: string): string => s.replace(/\r?\n/g, '\r\n');

/** Rows a frame occupies once drawn, wrapping included. Used to reserve
 *  vertical space before the animation starts. */
const frameRowCount = (body: string, cols: number): number => {
  let rows = 0;
  for (const line of body.replace(ANY_ESCAPE_RE, '').split('\n')) {
    rows += Math.max(1, Math.ceil(line.length / cols));
  }
  return rows;
};

/**
 * Drop segments that carry no drawable content — only control sequences.
 * A cursor-restore stream opens with its setup preamble (`\x1b[?25l\x1b7`)
 * before the first `\x1b8`, and `splitIntoFrames` hands that back as a
 * segment; painted, it's a blank flash at the head of the animation.
 * Whitespace-only segments are kept: for cursor-up splits those are the
 * program's intentional vertical spacing.
 */
const dropControlOnly = (frames: string[]): string[] => {
  const drawable = frames.filter((f) => f.replace(ANY_ESCAPE_RE, '') !== '');
  return drawable.length > 0 ? drawable : frames;
};

/** Downsample evenly, always keeping the first and last frame. */
const sampleFrames = (frames: string[]): string[] => {
  if (frames.length <= MAX_ANIMATION_FRAMES) return frames;
  const step = (frames.length - 1) / (MAX_ANIMATION_FRAMES - 1);
  return Array.from(
    { length: MAX_ANIMATION_FRAMES },
    (_, i) => frames[Math.round(i * step)],
  );
};

/** Park the cursor at the start of a fresh row so the next prompt doesn't
 *  land on the tail of the command's last line. No frame is captured —
 *  the caller's `writePrompt` does that a moment later. */
const settleCursor = (ctx: InterpreterContext): void => {
  if (ctx.state.cursor.col !== 0) {
    ctx.state = processInput(ctx.state, '\r\n');
  }
};

/**
 * Write one command's output into the grid, as an animation when the
 * program drew one and as a single paint otherwise.
 */
const writeShellOutput = (
  ctx: InterpreterContext,
  output: string,
  outputSpanMs: number,
): void => {
  const animation = detectAnimationType(output);
  const frames = ANIMATED_TYPES.has(animation)
    ? sampleFrames(dropControlOnly(splitIntoFrames(output, animation)))
    : [];

  // Not animated, or the split collapsed to one frame (e.g. a CLI that
  // hides the cursor but never redraws): paint the blob in one go, which
  // is exactly the old behaviour.
  if (frames.length < 2) {
    writeAndCapture(ctx, normalizeNewlines(output), 0);
    settleCursor(ctx);
    return;
  }

  const bodies = frames.map((f) =>
    normalizeNewlines(f.replace(LIVE_CONTROL_RE, '')),
  );

  // Reserve room for the tallest frame before drawing anything. If the
  // animation were to scroll the grid partway through, the anchor row
  // would shift out from under every remaining frame and the redraw
  // would smear. Scrolling up front costs nothing — it's what a real
  // terminal does when output reaches the bottom.
  let anchorRow = ctx.state.cursor.row;
  const tallest = bodies.reduce(
    (max, body) => Math.max(max, frameRowCount(body, ctx.state.width)),
    0,
  );
  const overflow = anchorRow + tallest - ctx.state.height;
  if (overflow > 0) {
    ctx.state = processInput(ctx.state, '\n'.repeat(overflow));
    anchorRow = Math.max(0, anchorRow - overflow);
  }

  // Spread the frames over the span the command actually took, so a
  // 1s chartscii animation plays back in 1s.
  const interval = Math.min(
    MAX_ANIMATION_FRAME_MS,
    Math.max(
      MIN_ANIMATION_FRAME_MS,
      outputSpanMs > 0 ? outputSpanMs / bodies.length : DEFAULT_ANIMATION_FRAME_MS,
    ),
  );

  for (const body of bodies) {
    // Home to the anchor (CUP is 1-based), erase from there to the end of
    // the screen, repaint. Erasing matters for frames that shrink —
    // otherwise the tail of a taller earlier frame stays on screen.
    writeAndCapture(ctx, `\x1b[${anchorRow + 1};1H\x1b[0J${body}`, interval);
  }
  settleCursor(ctx);
};

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
              const result = await executor.run(command);
              const { output, outputSpanMs } =
                typeof result === 'string'
                  ? { output: result, outputSpanMs: 0 }
                  : result;
              if (output) {
                writeShellOutput(ctx, output, outputSpanMs ?? 0);
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

/**
 * The emitter options shared by every output this app produces — the
 * animated SVG, and the still frames the video encoder rasterizes.
 *
 * Kept in one place deliberately: the video is only faithful if each frame
 * is emitted with byte-identical styling to the animation it came from, and
 * two hand-maintained copies of this list would drift on the first new
 * option anyone adds.
 */
export const buildEmitterOptions = (
  options: RenderOptions,
  theme: Theme,
  width: number,
  height: number,
  // The app only ever sets a plain-string watermark, and the filmstrip
  // context is narrower than EmitterOptions on that one field — so keep
  // the narrower type here and stay assignable to both.
): Omit<EmitterOptions, 'watermark'> & { watermark?: string } => ({
  theme,
  template: options.template,
  width,
  height,
  fontSize: options.fontSize,
  title: options.title,
  watermark: options.watermark,
  lineHeight: options.fontSize * options.lineHeight,
  charWidth: options.fontSize * CHAR_WIDTH_RATIO,
  letterSpacing: options.letterSpacing || undefined,
  padding: options.padding,
  borderRadius: options.borderRadius,
  borderColor: options.borderColor,
  borderWidth: options.borderWidth || undefined,
  headerHeight: options.template === 'minimal' ? 0 : 40,
  cursorStyle: options.cursorStyle,
  cursorColor: options.cursorColor,
  cursorBlink: options.cursorBlink,
  background: parseBackground(options.background),
  backgroundPadding: options.backgroundPadding,
  backgroundRadius: options.backgroundRadius,
});

const buildAnimationOptions = (opts: RenderOptions): AnimationOptions => ({
  fps: opts.fps,
  loop: opts.loop,
  loopStyle: opts.loopStyle,
  pauseAtEnd: opts.pauseAtEnd,
  loopPause: opts.loopPause,
  fadeDuration: opts.fadeDuration,
  rewindSpeed: opts.rewindSpeed,
});

/**
 * Apply `playbackSpeed` by rescaling every frame's timestamp. Speed 2.0
 * halves the timestamps (frames fire twice as fast); speed 0.5 doubles
 * them. A speed of exactly 1 returns the original array so we don't
 * allocate a new copy on the common case.
 */
const applyPlaybackSpeed = (
  frames: FrameData[],
  speed: number,
): FrameData[] => {
  if (!Number.isFinite(speed) || speed === 1 || speed <= 0) return frames;
  return frames.map((f) => ({
    ...f,
    timestamp: Math.round(f.timestamp / speed),
  }));
};

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

  // Explicit `Set Width` / `Set Height` from the script (or from the UI's
  // Frame section) overrides the auto-fit calculation. This is per-view —
  // the cast preview can have its own pinned dimensions independent of
  // whatever the script editor has set.
  const autoWidth = Math.ceil(cols * charWidth + options.padding * 2);
  const autoHeight = Math.ceil(
    rows * lineHeightPx + headerHeight + options.padding * 2,
  );
  const width = options.width ?? autoWidth;
  const height = options.height ?? autoHeight;

  return { width, height, cols, rows };
};

/* ------------------------------------------------------------------ */
/*                 Cast playback split into theme-less parts          */
/* ------------------------------------------------------------------ */
/* The lib's `generateFramesFromRecording` is the slow step on big      */
/* casts. It does two things in one pass:                              */
/*   1. Replay every recorded event through the virtual terminal,      */
/*      mutating a grid state (theme-independent).                     */
/*   2. At each capture point, *coalesce* the grid into colored row    */
/*      spans (theme-dependent).                                       */
/* We split those — `playCastSnapshots` does only (1) and returns the  */
/* per-frame grid states; `framesFromSnapshots` does only (2) over the */
/* cached snapshots. The worker then:                                  */
/*   - Caches snapshots keyed by `source` (slow path runs only when    */
/*     the cast file changes).                                         */
/*   - Caches frames keyed by `(source, themeKey)` so theme tweaks     */
/*     only re-coalesce — no event replay, no re-parse — and pure      */
/*     visual changes reuse the cached frames directly.                */
/* ------------------------------------------------------------------ */

export interface GridSnapshot {
  /** Immutable grid state at this capture point. `processInput` in
   *  dvdrw is non-mutating (returns a new state), so we can stash
   *  references without cloning. */
  grid: GridState;
  cursor: { row: number; col: number };
  cursorVisible: boolean;
  /** Milliseconds since recording start. */
  timestamp: number;
}

/** Endpoint-of-sequence test borrowed from the lib's `coalesceEvents`. */
const endsWithIncompleteSequence = (data: string): boolean => {
  // Matches the heuristic used in dvdrw's recording-player: anything
  // ending in ESC mid-CSI / OSC is considered incomplete.
  const tail = data.slice(-8);
  return /\x1b(\[[\d;?]*|\]|]\d+;?)?$/.test(tail);
};

/**
 * Mirrors `coalesceEvents` from dvdrw's recording-player. Adjacent
 * same-type events within 5ms (or 10ms for incomplete escape
 * sequences) are merged so a split ANSI sequence is never processed
 * in two halves.
 */
type CastEvent = [number, 'o' | 'i', string];

const coalesceCastEvents = (events: CastEvent[]): CastEvent[] => {
  if (events.length === 0) return [];
  const out: CastEvent[] = [];
  let [curTs, curType, curData] = events[0];
  let lastTs = curTs;
  for (let i = 1; i < events.length; i++) {
    const [ts, type, data] = events[i];
    const delta = ts - lastTs;
    const withinThreshold = delta < 0.005;
    const incompleteCarry =
      endsWithIncompleteSequence(curData) && delta < 0.010;
    if (type === curType && (withinThreshold || incompleteCarry)) {
      curData += data;
      lastTs = ts;
    } else {
      out.push([curTs, curType, curData]);
      curTs = ts;
      curType = type;
      curData = data;
      lastTs = ts;
    }
  }
  out.push([curTs, curType, curData]);
  return out;
};

/**
 * Walk a `.cast` source through the virtual terminal and capture the
 * grid state at each frame boundary. Theme-independent. Caching this
 * lets a theme change skip the expensive event-replay loop entirely.
 */
export const playCastSnapshots = (source: string): GridSnapshot[] => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recording = parseCastFile(source) as any;
  const header = recording.header ?? {};
  const cols = header.width ?? 80;
  const rows = header.height ?? 24;

  let grid: GridState = createGridState(cols, rows);
  const events = coalesceCastEvents(recording.events as CastEvent[]);

  const MIN_FRAME_INTERVAL_MS = 16; // ~60fps cap, mirrors the lib
  const MAX_FRAME_INTERVAL_MS = 2000;

  const snapshots: GridSnapshot[] = [];
  const capture = (timestampMs: number) => {
    snapshots.push({
      grid,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cursor: { ...(grid as any).cursor },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cursorVisible: (grid as any).cursorVisible,
      timestamp: timestampMs,
    });
  };

  // Initial frame at t=0.
  capture(0);
  let lastFrameMs = 0;

  for (const [ts, type, data] of events) {
    if (type === 'o') {
      grid = processInput(grid, data);
    }
    const tsMs = ts * 1000;
    if (type === 'o' && tsMs - lastFrameMs >= MIN_FRAME_INTERVAL_MS) {
      const capped =
        tsMs - lastFrameMs > MAX_FRAME_INTERVAL_MS
          ? lastFrameMs + MAX_FRAME_INTERVAL_MS
          : tsMs;
      capture(capped);
      lastFrameMs = capped;
    }
  }

  // Final frame at the last event's timestamp (lib mirrors this).
  if (events.length > 0) {
    const lastMs = events[events.length - 1][0] * 1000;
    if (lastMs > lastFrameMs) capture(lastMs);
  }

  return snapshots;
};

/**
 * Coalesce each cached grid snapshot into themed frame rows. Cheap —
 * O(snapshots × cells), no event replay. Re-runs on theme changes
 * only; pure visual options reuse the resulting frames as-is.
 */
export const framesFromSnapshots = (
  snapshots: GridSnapshot[],
  theme: Theme,
): FrameData[] =>
  snapshots.map((s) => ({
    rows: coalesce(s.grid, theme),
    cursor: s.cursor,
    cursorVisible: s.cursorVisible,
    timestamp: s.timestamp,
  }));

/**
 * Convenience wrapper for callers that don't care about caching —
 * does the same work as the lib's `generateFramesFromRecording` but
 * routed through our split helpers so the behaviour stays in sync.
 */
export const prepareCastFrames = (
  source: string,
  theme: Theme,
): FrameData[] => framesFromSnapshots(playCastSnapshots(source), theme);

// Re-export the lib's bulk-render shortcut so the worker keeps a
// reference even though we no longer call it from the cast path —
// retained for any future callsites that want a no-cache path.
export { generateFramesFromRecording };

export const buildAnimation = (
  frames: FrameData[],
  options: RenderOptions,
  theme: Theme,
): RenderResult => {
  if (frames.length === 0) {
    throw new Error('No frames to render. Add some commands or recording events.');
  }

  // Apply playback speed once upstream so downstream timing — frame
  // emission, pause-at-end, loop durations — all respect the speed.
  const scaled = applyPlaybackSpeed(frames, options.playbackSpeed ?? 1);

  const { width, height } = computeDimensions(scaled, options);

  // Background may be either a raw hex (e.g. "#1e1e2e") or the gradient
  // syntax dvdrw's high-level API accepts (`gradient(#a, #b:vertical)`).
  // Low-level emitters want it pre-parsed; if we hand them the raw
  // gradient string they bail and paint nothing — which is the "black
  // background" the user was seeing. `buildEmitterOptions` parses it.
  const emitter = buildEmitterOptions(options, theme, width, height);

  let svg: string;

  if (options.engine === 'smil') {
    const result = emitAnimated(scaled, {
      ...emitter,
      fps: options.fps,
      loop: options.loop,
      pauseAtEnd: options.pauseAtEnd,
    });
    svg = result.svg;
  } else {
    svg = createFilmstripSVG(
      {
        ...emitter,
        frameData: scaled,
        customGlyphs: options.customGlyphs ?? true,
      },
      buildAnimationOptions(options),
    );
  }

  if (options.optimize) {
    svg = optimizeSvg(svg);
  }

  const lastTs = scaled[scaled.length - 1].timestamp;

  return {
    svg,
    width,
    height,
    frameCount: scaled.length,
    durationMs: lastTs,
  };
};

/**
 * Build the constant-frame-rate plan a video encoder consumes, using the
 * exact dimensions and styling `buildAnimation` would have produced for the
 * same frames. `playbackSpeed` is applied first so the video honours it the
 * same way the SVG does.
 */
export const buildVideoPlan = (
  frames: FrameData[],
  options: RenderOptions,
  theme: Theme,
  video: {
    fps?: number;
    loops?: number;
    quality?: VideoQuality;
    /** Explicit supersampling factor, overriding the tier's own. */
    scale?: number;
  } = {},
): VideoPlan => {
  if (frames.length === 0) {
    throw new Error('No frames to encode. Run the script first.');
  }
  const scaled = applyPlaybackSpeed(frames, options.playbackSpeed ?? 1);
  const { width, height } = computeDimensions(scaled, options);
  return planVideo(scaled, {
    emitter: buildEmitterOptions(options, theme, width, height),
    fps: video.fps,
    loops: video.loops,
    quality: video.quality,
    // Must be forwarded: the encoder steps this down when a supersampled
    // frame is too large for the browser's codec, and dropping it here
    // silently rebuilt an identical oversized plan on every retry.
    scale: video.scale,
    // Match the animated SVG's trailing hold so the video doesn't cut the
    // instant the last frame lands.
    pauseAtEnd: options.pauseAtEnd,
  });
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
  /**
   * The frames the animation was built from. Kept on the result so video
   * export doesn't have to re-run the whole interpreter (which, for the
   * container path, would mean re-running the user's shell commands).
   */
  frames: FrameData[];
}

/**
 * Produce just the frames for an input, without emitting any SVG.
 *
 * Used by video export from the preview surfaces, where the render itself
 * happened inside the worker and the main thread never received the frames.
 * Re-deriving is cheaper than shipping every frame across `postMessage` on
 * each render just in case someone later clicks export.
 */
export const framesForInput = (
  input: RenderInput,
  options: RenderOptions,
  customThemes: CustomTheme[] = [],
): { frames: FrameData[]; theme: Theme } => {
  const theme = resolveTheme(options.theme, customThemes);
  if (input.kind === 'script') {
    const script = parseCDScript(input.source);
    const charWidth = options.fontSize * CHAR_WIDTH_RATIO;
    const lineHeightPx = options.fontSize * options.lineHeight;
    const termCols = Math.max(40, Math.floor(800 / charWidth));
    const termRows = Math.max(8, Math.floor(420 / lineHeightPx));
    const { frames } = interpret(script.commands, termCols, termRows, theme);
    return { frames, theme };
  }
  return { frames: prepareCastFrames(input.source, theme), theme };
};

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
  return { ...result, notices, frames };
};

export const renderInput = (
  input: RenderInput,
  options: RenderOptions,
  customThemes: CustomTheme[] = [],
): RenderOutput => {
  const theme = resolveTheme(options.theme, customThemes);

  if (input.kind === 'script') {
    const script = parseCDScript(input.source);
    const charWidth = options.fontSize * CHAR_WIDTH_RATIO;
    const lineHeightPx = options.fontSize * options.lineHeight;
    const termCols = Math.max(40, Math.floor(800 / charWidth));
    const termRows = Math.max(8, Math.floor(420 / lineHeightPx));

    const { frames, notices } = interpret(script.commands, termCols, termRows, theme);
    const result = buildAnimation(frames, options, theme);
    return { ...result, notices, frames };
  }

  const recording = parseCastFile(input.source);
  const frames = generateFramesFromRecording(recording, theme);
  const result = buildAnimation(frames, options, theme);
  return { ...result, notices: [], frames };
};

export { resolveTheme };
