/**
 * Minimal hex / RGB / HSL conversion + manipulation utilities used by
 * the brand-color theme system. These intentionally don't depend on
 * any framework or library — they're called both from React effects
 * and from one-shot script blocks that run before React mounts.
 */

const HEX_FULL = /^#?([a-fA-F0-9]{6})$/;
const HEX_SHORT = /^#?([a-fA-F0-9]{3})$/;

export const normalizeHex = (input: string): string => {
  const m6 = HEX_FULL.exec(input);
  if (m6) return `#${m6[1].toLowerCase()}`;
  const m3 = HEX_SHORT.exec(input);
  if (m3) {
    const [, a, b, c] = m3[0].replace('#', '');
    return `#${a}${a}${b}${b}${c}${c}`.toLowerCase();
  }
  return '#000000';
};

export const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(normalizeHex(hex).slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
};

export const rgbToHex = (r: number, g: number, b: number): string => {
  const to = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
};

export const hexToRgba = (hex: string, alpha: number): string => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export const hexToHsl = (hex: string): [number, number, number] => {
  const [r, g, b] = hexToRgb(hex).map((n) => n / 255) as [
    number,
    number,
    number,
  ];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s * 100, l * 100];
};

export const hslToHex = (h: number, s: number, l: number): string => {
  const sn = s / 100;
  const ln = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) =>
    ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgbToHex(f(0) * 255, f(8) * 255, f(4) * 255);
};

/** Shift lightness by `amount` percentage points, clamped to [0, 100]. */
export const adjustLightness = (hex: string, amount: number): string => {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, s, Math.max(0, Math.min(100, l + amount)));
};

/** Compress lightness toward a target value — used for `darkenToward`
 *  the canvas tone so the favicon's background tint follows the brand
 *  hue without ever drifting too light. */
export const compressLightness = (hex: string, target: number): string => {
  const [h, s] = hexToHsl(hex);
  return hslToHex(h, s, target);
};
