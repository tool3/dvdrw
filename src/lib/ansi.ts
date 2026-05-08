/**
 * Minimal ANSI → styled spans converter for the runner's container-output
 * panel. Handles the SGR escape codes npm/chalk/dvd actually emit (regular
 * + bright fg/bg, bold/dim/italic/underline/inverse, 8-bit and truecolor).
 * Non-SGR escapes (cursor moves, erase, OSC) are silently dropped — they
 * have no meaning in a static log view.
 */

export interface AnsiStyle {
  fg?: string;
  bg?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  inverse?: boolean;
}

export interface AnsiSpan {
  text: string;
  style: AnsiStyle;
}

/* ----------------------------- Color palette ----------------------------- */

// Tuned for a near-black background (`#050505`). Same general feel as our
// editor highlight palette so the runner panel looks like the same product.
const BASE_COLORS = [
  '#1a1a1a', // 30 black
  '#ff7b72', // 31 red
  '#7cd2a5', // 32 green
  '#ffd07a', // 33 yellow
  '#7cb1ff', // 34 blue
  '#bca6ff', // 35 magenta
  '#7cdcfb', // 36 cyan
  '#d8d8d8', // 37 white
];

const BRIGHT_COLORS = [
  '#5a5a5a', // 90
  '#ff8a8a', // 91
  '#a6e3a1', // 92
  '#ffe199', // 93
  '#a4ddff', // 94
  '#cebbff', // 95
  '#a8ecff', // 96
  '#ffffff', // 97
];

const ansi256 = (n: number): string => {
  if (n < 8) return BASE_COLORS[n];
  if (n < 16) return BRIGHT_COLORS[n - 8];
  if (n < 232) {
    // 6×6×6 cube
    const i = n - 16;
    const r = Math.floor(i / 36);
    const g = Math.floor((i % 36) / 6);
    const b = i % 6;
    const map = [0, 95, 135, 175, 215, 255];
    return `rgb(${map[r]},${map[g]},${map[b]})`;
  }
  // 24-step grayscale
  const v = 8 + (n - 232) * 10;
  return `rgb(${v},${v},${v})`;
};

/* --------------------------- SGR state machine --------------------------- */

const RESET: AnsiStyle = {};

export const applyCodes = (style: AnsiStyle, codes: number[]): AnsiStyle => {
  let s: AnsiStyle = { ...style };

  for (let i = 0; i < codes.length; i++) {
    const c = codes[i];
    switch (true) {
      case c === 0:
        s = { ...RESET };
        break;
      case c === 1:
        s.bold = true;
        break;
      case c === 2:
        s.dim = true;
        break;
      case c === 3:
        s.italic = true;
        break;
      case c === 4:
        s.underline = true;
        break;
      case c === 7:
        s.inverse = true;
        break;
      case c === 22:
        s.bold = false;
        s.dim = false;
        break;
      case c === 23:
        s.italic = false;
        break;
      case c === 24:
        s.underline = false;
        break;
      case c === 27:
        s.inverse = false;
        break;
      case c >= 30 && c <= 37:
        s.fg = BASE_COLORS[c - 30];
        break;
      case c >= 90 && c <= 97:
        s.fg = BRIGHT_COLORS[c - 90];
        break;
      case c === 39:
        s.fg = undefined;
        break;
      case c >= 40 && c <= 47:
        s.bg = BASE_COLORS[c - 40];
        break;
      case c >= 100 && c <= 107:
        s.bg = BRIGHT_COLORS[c - 100];
        break;
      case c === 49:
        s.bg = undefined;
        break;
      case c === 38:
        if (codes[i + 1] === 5) {
          s.fg = ansi256(codes[i + 2] ?? 0);
          i += 2;
        } else if (codes[i + 1] === 2) {
          s.fg = `rgb(${codes[i + 2] ?? 0},${codes[i + 3] ?? 0},${codes[i + 4] ?? 0})`;
          i += 4;
        }
        break;
      case c === 48:
        if (codes[i + 1] === 5) {
          s.bg = ansi256(codes[i + 2] ?? 0);
          i += 2;
        } else if (codes[i + 1] === 2) {
          s.bg = `rgb(${codes[i + 2] ?? 0},${codes[i + 3] ?? 0},${codes[i + 4] ?? 0})`;
          i += 4;
        }
        break;
    }
  }

  return s;
};

/* ----------------------------- Tokenization ----------------------------- */

// Match a CSI sequence: ESC [ <digits and ;> <single letter>
// Also tolerate ESC ] ... BEL (OSC) and ESC <single byte> sequences which
// we drop. Anything that doesn't match falls through as plain text.
const CSI_RE = /\x1b\[([\d;?]*)([@-~])/g;
const OSC_RE = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
const STRIP_OTHER_ESC_RE = /\x1b[@-Z\\-_]/g;

const cleanForLog = (input: string): string =>
  input
    .replace(OSC_RE, '')
    .replace(STRIP_OTHER_ESC_RE, '')
    // Carriage returns inside a line only mean "rewrite the line" in a real
    // terminal. In our scrollback we treat \r\n as a single newline and
    // drop bare \r so chalk/npm-progress lines render readably.
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '');

export const tokenizeAnsi = (input: string): AnsiSpan[] => {
  const cleaned = cleanForLog(input);
  const spans: AnsiSpan[] = [];
  let style: AnsiStyle = {};
  let last = 0;
  let m: RegExpExecArray | null;

  CSI_RE.lastIndex = 0;
  while ((m = CSI_RE.exec(cleaned)) !== null) {
    const text = cleaned.slice(last, m.index);
    if (text) spans.push({ text, style });
    if (m[2] === 'm') {
      const codes = m[1] === '' ? [0] : m[1].split(';').map((p) => Number(p) || 0);
      style = applyCodes(style, codes);
    }
    // Other CSI letters (cursor moves, erase): drop them.
    last = m.index + m[0].length;
  }
  const tail = cleaned.slice(last);
  if (tail) spans.push({ text: tail, style });

  return spans;
};

/* ---------------------- Span styling for the renderer ------------------- */

import type { CSSProperties } from 'react';

const DIM_OPACITY = 0.6;

export const styleToCss = (s: AnsiStyle, defaultFg: string, defaultBg: string): CSSProperties => {
  const fg = s.fg ?? defaultFg;
  const bg = s.bg ?? defaultBg;
  const css: CSSProperties = {};

  if (s.inverse) {
    css.color = bg;
    css.backgroundColor = fg;
  } else {
    if (s.fg) css.color = fg;
    if (s.bg) css.backgroundColor = bg;
  }
  if (s.bold) css.fontWeight = 600;
  if (s.italic) css.fontStyle = 'italic';
  if (s.underline) css.textDecoration = 'underline';
  if (s.dim) css.opacity = DIM_OPACITY;

  return css;
};
