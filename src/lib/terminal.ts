/**
 * Terminal buffer for the runner's container-output panel.
 *
 * dvdrw-cli, chartscii's `-e` animation, ora, listr, etc. all redraw in place
 * using a mix of `\r`, cursor up/down (CSI A/B), absolute positioning (CSI H),
 * erase-line (CSI K), erase-display (CSI J), and save/restore (CSI s/u). The
 * earlier "scrollback + current line" model couldn't replay any of those —
 * once a `\n` committed a line, vertical cursor moves had nothing to overwrite,
 * so multi-frame animations collapsed to first + last only.
 *
 * This is a 2D row buffer instead. All rows are mutable. The cursor is a
 * (row, col) anchor; writes overwrite-in-place; CSI 2J pins a new "screen
 * origin" so absolute positioning aligns with whatever the program last
 * cleared. The rest is straight ECMA-48: SGR, CUU/CUD/CUF/CUB, CHA, CUP,
 * EL, ED, SCP/RCP. Modes we don't need (DECSET/RESET, scrolling regions,
 * insert/delete, character set switching) are silently dropped.
 */
import { applyCodes, type AnsiSpan, type AnsiStyle } from './ansi';

interface Cell {
  ch: string;
  style: AnsiStyle;
}

const SCROLLBACK_LIMIT = 4000;
const EMPTY_STYLE: AnsiStyle = {};
const blankCell = (): Cell => ({ ch: ' ', style: EMPTY_STYLE });

export class TerminalBuffer {
  private lines: Cell[][] = [[]];
  private row = 0;
  private col = 0;
  private screenOrigin = 0;
  private style: AnsiStyle = {};
  private savedCursor: { row: number; col: number; style: AnsiStyle } | null = null;

  reset(): void {
    this.lines = [[]];
    this.row = 0;
    this.col = 0;
    this.screenOrigin = 0;
    this.style = {};
    this.savedCursor = null;
  }

  isEmpty(): boolean {
    return this.lines.length === 1 && this.lines[0].length === 0;
  }

  write(input: string): void {
    let i = 0;
    while (i < input.length) {
      const ch = input[i];

      if (ch === '\x1b') {
        const csi = matchCsi(input, i);
        if (csi) {
          this.handleCsi(csi.params, csi.intermediate, csi.final);
          i += csi.length;
          continue;
        }
        const osc = matchOsc(input, i);
        if (osc) {
          i += osc.length;
          continue;
        }
        // ESC c (RIS) — full reset
        if (input[i + 1] === 'c') {
          this.reset();
          i += 2;
          continue;
        }
        // Unknown ESC X — drop the escape + next byte.
        i += i + 1 < input.length ? 2 : 1;
        continue;
      }

      if (ch === '\r') {
        this.col = 0;
        i++;
        continue;
      }

      if (ch === '\n') {
        this.row++;
        this.ensureRow(this.row);
        this.trimScrollback();
        i++;
        continue;
      }

      if (ch === '\b') {
        if (this.col > 0) this.col--;
        i++;
        continue;
      }

      if (ch === '\t') {
        const next = (Math.floor(this.col / 8) + 1) * 8;
        while (this.col < next) this.putChar(' ');
        i++;
        continue;
      }

      const code = ch.charCodeAt(0);
      if (code < 0x20 || code === 0x7f) {
        i++;
        continue;
      }

      this.putChar(ch);
      i++;
    }
  }

  getLines(): Cell[][] {
    return this.lines;
  }

  private ensureRow(r: number): void {
    while (this.lines.length <= r) this.lines.push([]);
  }

  private putChar(ch: string): void {
    this.ensureRow(this.row);
    const line = this.lines[this.row];
    while (line.length < this.col) line.push(blankCell());
    if (this.col < line.length) {
      line[this.col] = { ch, style: this.style };
    } else {
      line.push({ ch, style: this.style });
    }
    this.col++;
  }

  private handleCsi(params: number[], intermediate: string, final: string): void {
    // ?-prefixed (DEC private modes): used for cursor visibility, alt screen,
    // bracketed paste. Visual-only modes don't matter here; alt-screen we treat
    // as a screen clear so animations that toggle into/out of it still work.
    if (intermediate === '?') {
      if (final === 'h' || final === 'l') {
        for (const code of params) {
          if (code === 1049 || code === 47 || code === 1047) {
            this.eraseScreen();
          }
        }
      }
      return;
    }

    const arg = (idx: number, def: number) => {
      const v = params[idx];
      return v === undefined || v === 0 ? def : v;
    };

    switch (final) {
      case 'A': // CUU
        this.row = Math.max(this.screenOrigin, this.row - arg(0, 1));
        return;
      case 'B': // CUD
        this.row += arg(0, 1);
        this.ensureRow(this.row);
        this.trimScrollback();
        return;
      case 'C': // CUF
        this.col += arg(0, 1);
        return;
      case 'D': // CUB
        this.col = Math.max(0, this.col - arg(0, 1));
        return;
      case 'E': // CNL
        this.row += arg(0, 1);
        this.col = 0;
        this.ensureRow(this.row);
        return;
      case 'F': // CPL
        this.row = Math.max(this.screenOrigin, this.row - arg(0, 1));
        this.col = 0;
        return;
      case 'G': // CHA
        this.col = Math.max(0, arg(0, 1) - 1);
        return;
      case 'H': // CUP
      case 'f': {
        const r = arg(0, 1);
        const c = arg(1, 1);
        this.row = this.screenOrigin + (r - 1);
        this.col = c - 1;
        this.ensureRow(this.row);
        return;
      }
      case 'd': // VPA
        this.row = this.screenOrigin + (arg(0, 1) - 1);
        this.ensureRow(this.row);
        return;
      case 'J': {
        const n = params[0] ?? 0;
        if (n === 0) {
          // From cursor to end of screen.
          this.ensureRow(this.row);
          this.lines[this.row] = this.lines[this.row].slice(0, this.col);
          this.lines.length = this.row + 1;
        } else if (n === 1) {
          // From start of screen to cursor.
          for (let r = this.screenOrigin; r < this.row; r++) {
            this.lines[r] = [];
          }
          if (this.lines[this.row]) {
            const line = this.lines[this.row];
            const limit = Math.min(this.col + 1, line.length);
            for (let c = 0; c < limit; c++) line[c] = blankCell();
          }
        } else {
          // 2 or 3 — clear screen. Pin a new origin at current cursor row so
          // subsequent CSI H lands at this fresh top, leaving prior output as
          // scrollback above (matches what users see in real terminals).
          this.eraseScreen();
        }
        return;
      }
      case 'K': {
        const n = params[0] ?? 0;
        this.ensureRow(this.row);
        const line = this.lines[this.row];
        if (n === 0) {
          this.lines[this.row] = line.slice(0, this.col);
        } else if (n === 1) {
          const limit = Math.min(this.col + 1, line.length);
          for (let c = 0; c < limit; c++) line[c] = blankCell();
        } else if (n === 2) {
          this.lines[this.row] = [];
        }
        return;
      }
      case 'm':
        this.style = applyCodes(this.style, params.length === 0 ? [0] : params);
        return;
      case 's':
        this.savedCursor = { row: this.row, col: this.col, style: { ...this.style } };
        return;
      case 'u':
        if (this.savedCursor) {
          this.row = this.savedCursor.row;
          this.col = this.savedCursor.col;
          this.style = { ...this.savedCursor.style };
          this.ensureRow(this.row);
        }
        return;
      // Unhandled (insert/delete chars/lines, scrolling regions, modes): no-op.
    }
  }

  private eraseScreen(): void {
    // Push origin to the line after the last non-empty row so prior output is
    // preserved as scrollback while subsequent absolute positioning starts
    // from a clean slate.
    let lastNonEmpty = this.lines.length - 1;
    while (lastNonEmpty >= 0 && this.lines[lastNonEmpty].length === 0) lastNonEmpty--;
    const newOrigin = lastNonEmpty + 1;
    if (newOrigin >= this.lines.length) {
      this.lines.push([]);
    }
    this.screenOrigin = newOrigin;
    this.row = newOrigin;
    this.col = 0;
  }

  private trimScrollback(): void {
    if (this.lines.length > SCROLLBACK_LIMIT) {
      const drop = this.lines.length - SCROLLBACK_LIMIT;
      this.lines.splice(0, drop);
      this.row = Math.max(0, this.row - drop);
      this.screenOrigin = Math.max(0, this.screenOrigin - drop);
      if (this.savedCursor) {
        this.savedCursor.row = Math.max(0, this.savedCursor.row - drop);
      }
    }
  }
}

// CSI = ESC '[' <?>? <param-bytes> <intermediate-bytes>* <final-byte>
// final = 0x40-0x7e. We only care about a few finals; the rest pass through.
const CSI_RE = /^\x1b\[(\?)?([\d;]*)([ -/]*)([@-~])/;

const matchCsi = (
  input: string,
  i: number,
):
  | { params: number[]; intermediate: string; final: string; length: number }
  | null => {
  const m = CSI_RE.exec(input.slice(i));
  if (!m) return null;
  const params = m[2] ? m[2].split(';').map((p) => Number(p) || 0) : [];
  return {
    params,
    intermediate: m[1] ?? '',
    final: m[4],
    length: m[0].length,
  };
};

const matchOsc = (input: string, i: number): { length: number } | null => {
  if (input.charCodeAt(i + 1) !== 0x5d) return null; // ']'
  for (let j = i + 2; j < input.length; j++) {
    const c = input.charCodeAt(j);
    if (c === 0x07) return { length: j - i + 1 };
    if (c === 0x1b && input.charCodeAt(j + 1) === 0x5c) return { length: j - i + 2 };
  }
  return null;
};

export const cellsToSpans = (cells: Cell[]): AnsiSpan[] => {
  if (cells.length === 0) return [];
  const spans: AnsiSpan[] = [];
  let cur: AnsiSpan = { text: cells[0].ch, style: cells[0].style };
  for (let i = 1; i < cells.length; i++) {
    const cell = cells[i];
    if (sameStyle(cur.style, cell.style)) {
      cur.text += cell.ch;
    } else {
      spans.push(cur);
      cur = { text: cell.ch, style: cell.style };
    }
  }
  spans.push(cur);
  return spans;
};

const sameStyle = (a: AnsiStyle, b: AnsiStyle): boolean =>
  a.fg === b.fg &&
  a.bg === b.bg &&
  a.bold === b.bold &&
  a.dim === b.dim &&
  a.italic === b.italic &&
  a.underline === b.underline &&
  a.inverse === b.inverse;
