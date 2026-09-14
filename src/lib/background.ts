/**
 * Structured view over the `background` option, which is stored — and read
 * by the lib — as a string: either a bare colour (`#161618`) or
 * `gradient(#a, #b:diagonal:reverse)`.
 *
 * The string is the source of truth because it round-trips through the .cd
 * script (`Set Background`). This module is the only place that knows the
 * grammar on the UI side, and its `parse` mirrors `parseBackground` in
 * `render.ts` exactly — if the two disagree, the menu shows one thing and
 * the render produces another.
 */

export type BackgroundDirection = 'horizontal' | 'vertical' | 'diagonal';
export type BackgroundKind = 'none' | 'solid' | 'gradient';

export interface BackgroundValue {
  kind: BackgroundKind;
  /** Gradient stops. Always at least two once `kind` is 'gradient'. */
  colors: string[];
  direction: BackgroundDirection;
  reverse: boolean;
}

/** What the emitter falls back to when the string omits a direction. */
const DEFAULT_DIRECTION: BackgroundDirection = 'vertical';

export const DEFAULT_SOLID = '#161618';
export const DEFAULT_GRADIENT_TO = '#7c2bff';

const isDirection = (value: string): value is BackgroundDirection =>
  value === 'horizontal' || value === 'vertical' || value === 'diagonal';

export const parseBackgroundValue = (raw: string | undefined): BackgroundValue => {
  const empty: BackgroundValue = {
    kind: 'none',
    colors: [DEFAULT_SOLID, DEFAULT_GRADIENT_TO],
    direction: DEFAULT_DIRECTION,
    reverse: false,
  };
  if (!raw) return empty;

  const match = raw.startsWith('gradient(') ? raw.match(/^gradient\(([^)]+)\)$/) : null;
  if (!match) return { ...empty, kind: 'solid', colors: [raw, DEFAULT_GRADIENT_TO] };

  const [colorsPart, ...options] = match[1].split(':');
  const colors = colorsPart
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c.length > 0);

  // An unparseable stop list is a string we'd render as a flat colour, so
  // present it that way rather than showing an empty gradient editor.
  if (colors.length === 0) return { ...empty, kind: 'solid', colors: [raw, DEFAULT_GRADIENT_TO] };

  const flags = options.map((o) => o.trim().toLowerCase());
  return {
    kind: 'gradient',
    colors: colors.length === 1 ? [colors[0], DEFAULT_GRADIENT_TO] : colors,
    direction: flags.find(isDirection) ?? DEFAULT_DIRECTION,
    reverse: flags.some((f) => f === 'reverse' || f === 'reversed'),
  };
};

export const serializeBackgroundValue = (
  value: BackgroundValue,
): string | undefined => {
  if (value.kind === 'none') return undefined;
  if (value.kind === 'solid') return value.colors[0] ?? DEFAULT_SOLID;

  const stops = value.colors.join(', ');
  const flags = [value.direction, ...(value.reverse ? ['reverse'] : [])];
  return `gradient(${stops}:${flags.join(':')})`;
};

/**
 * Switch kind while carrying the colours across, so flipping solid →
 * gradient → solid doesn't reset what the user picked.
 */
export const withKind = (
  value: BackgroundValue,
  kind: BackgroundKind,
): BackgroundValue => {
  if (kind === value.kind) return value;
  if (kind !== 'gradient') return { ...value, kind };
  const [first = DEFAULT_SOLID, second = DEFAULT_GRADIENT_TO] = value.colors;
  return { ...value, kind, colors: [first, second] };
};

/**
 * Clicking the already-selected direction reverses it; clicking a different
 * one selects it running forwards. Mirrors shellfied's direction control.
 */
export const withDirection = (
  value: BackgroundValue,
  direction: BackgroundDirection,
): BackgroundValue =>
  value.direction === direction
    ? { ...value, reverse: !value.reverse }
    : { ...value, direction, reverse: false };

export const withColorAt = (
  value: BackgroundValue,
  index: number,
  color: string,
): BackgroundValue => ({
  ...value,
  colors: value.colors.map((c, i) => (i === index ? color : c)),
});
