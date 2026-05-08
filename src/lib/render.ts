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
  GridState,
  Theme,
} from 'dvdrw';
import type { RenderOptions } from '../stores/optionsStore';
import type { RenderResult } from './types';

const CHAR_WIDTH_RATIO = 0.6;
const DEFAULT_TYPING_SPEED_MS = 50;

const resolveTheme = (name: string): Theme => {
  const themeMap = builtinThemes as unknown as Record<string, Theme>;
  return themeMap[name] ?? themeMap.dark;
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
        // Shortcuts on a non-shell preview don't translate; ignore quietly.
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
      background: options.background,
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
        background: options.background,
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
