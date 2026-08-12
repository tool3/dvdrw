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

/* ------------------------------------------------------------------ */
/*                             Contrast                               */
/* ------------------------------------------------------------------ */

/** WCAG relative luminance. Not the same as HSL lightness — green
 *  contributes far more perceived brightness than blue, which is exactly
 *  why "is this readable?" can't be answered from lightness alone. */
export const relativeLuminance = (hex: string): number => {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

/** WCAG contrast ratio between two colours: 1 (identical) to 21 (black
 *  on white). */
export const contrastRatio = (a: string, b: string): number => {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
};

/** Whichever of black / white is more readable on `background`. */
export const readableTextOn = (background: string): string =>
  contrastRatio(background, '#ffffff') >= contrastRatio(background, '#000000')
    ? '#ffffff'
    : '#000000';

/**
 * Nudge `hex` along its own lightness axis until it reaches `minRatio`
 * against `against`, keeping hue and saturation so it still reads as the
 * same colour.
 *
 * Direction is chosen by which way there is room to move: on a light
 * surface we darken, on a dark surface we lighten. Returns the input
 * untouched when it already passes, so a well-chosen brand is never
 * altered — this only ever rescues the extremes (pure white on the light
 * theme, near-black on the dark one).
 */
export const ensureContrast = (
  hex: string,
  against: string,
  minRatio: number,
): string => {
  if (contrastRatio(hex, against) >= minRatio) return hex;

  const [h, s, l] = hexToHsl(hex);
  const darken = relativeLuminance(against) > 0.5;

  // One percentage point at a time: slower than a binary search but it
  // stops at the *first* passing shade, so the result stays as close to
  // the chosen brand as legibility allows.
  for (let step = 1; step <= 100; step++) {
    const next = hslToHex(
      h,
      s,
      Math.max(0, Math.min(100, darken ? l - step : l + step)),
    );
    if (contrastRatio(next, against) >= minRatio) return next;
  }
  return darken ? '#000000' : '#ffffff';
};
