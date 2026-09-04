/**
 * Registry for `@svgfx/postprocessing`.
 *
 * The library exposes each effect as a factory taking an options object
 * (`scanlines({ gap: 4 })`). To drive that from a UI we need machine-
 * readable metadata the factories don't carry: control type, sensible
 * range, and the library's own default for each parameter.
 *
 * Every default below mirrors the destructured default in the library's
 * source, so a freshly added effect starts out looking exactly as it does
 * when called with no arguments. When bumping the library, this file is
 * the thing to re-check — a default that drifts here shows up as an effect
 * that looks different in the app than in the library.
 */

import {
  bloom,
  blur,
  brightness,
  chromaticAberration,
  contrast,
  crt,
  cyberpunk,
  duotone,
  emboss,
  fade,
  film,
  glitch,
  glow,
  grain,
  grayscale,
  halftone,
  hueRotate,
  invert,
  neon,
  newsprint,
  outline,
  pixelate,
  posterize,
  riso,
  saturate,
  scanlines,
  sepia,
  shadow,
  sharpen,
  threshold,
  tint,
  vhs,
  vignette,
  wave,
  xerox,
} from '@svgfx/postprocessing';
import type { Effect } from '@svgfx/postprocessing';

/* ------------------------------------------------------------------ */
/*                              Controls                              */
/* ------------------------------------------------------------------ */

export type ControlValue = number | boolean | string | null;

interface BaseControl {
  key: string;
  label: string;
  hint?: string;
}

export type Control =
  | (BaseControl & {
      type: 'number';
      default: number;
      min: number;
      max: number;
      step: number;
      suffix?: string;
    })
  | (BaseControl & { type: 'boolean'; default: boolean })
  | (BaseControl & { type: 'color'; default: string })
  /** A colour that can also be switched off entirely (`null`). */
  | (BaseControl & { type: 'optionalColor'; default: string | null })
  | (BaseControl & {
      type: 'enum';
      default: string;
      options: readonly string[];
    });

export type EffectGroup = 'Looks' | 'Light' | 'Colour' | 'Texture' | 'Distort';

export interface EffectDescriptor {
  id: string;
  label: string;
  group: EffectGroup;
  description: string;
  controls: readonly Control[];
  /** Build the library Effect from resolved parameter values. */
  build: (params: Record<string, ControlValue>) => Effect;
}

/** Shorthands — the registry below is long enough without the noise. */
const num = (
  key: string,
  label: string,
  d: number,
  min: number,
  max: number,
  step: number,
  extra: { suffix?: string; hint?: string } = {},
): Control => ({ type: 'number', key, label, default: d, min, max, step, ...extra });

const bool = (key: string, label: string, d: boolean, hint?: string): Control => ({
  type: 'boolean',
  key,
  label,
  default: d,
  hint,
});

const color = (key: string, label: string, d: string): Control => ({
  type: 'color',
  key,
  label,
  default: d,
});

const optionalColor = (
  key: string,
  label: string,
  d: string | null,
  hint?: string,
): Control => ({ type: 'optionalColor', key, label, default: d, hint });

const choice = (
  key: string,
  label: string,
  d: string,
  options: readonly string[],
): Control => ({ type: 'enum', key, label, default: d, options });

/** `amount`-style single-knob effects, of which the library has eight. */
const amount = (d: number, max = 2): Control =>
  num('amount', 'Amount', d, 0, max, 0.05);

/** Shared motion controls — several effects animate themselves. */
const ANIMATE = (speedDefault: number, speedMax: number): Control[] => [
  bool('animate', 'Animate', false, 'Adds its own SMIL animation to the SVG.'),
  num('speed', 'Speed', speedDefault, 0.1, speedMax, 0.1),
];

/* ------------------------------------------------------------------ */
/*                              Registry                              */
/* ------------------------------------------------------------------ */

export const EFFECTS: readonly EffectDescriptor[] = [
  /* ------------------------------- Looks ------------------------- */
  {
    id: 'crt',
    label: 'CRT',
    group: 'Looks',
    description: 'Scanlines, bloom and a curved-glass vignette.',
    controls: [bool('animate', 'Animate', false)],
    build: (p) => crt({ animate: p.animate as boolean }),
  },
  {
    id: 'vhs',
    label: 'VHS',
    group: 'Looks',
    description: 'Tape wobble, colour bleed and tracking noise.',
    controls: [bool('animate', 'Animate', false)],
    build: (p) => vhs({ animate: p.animate as boolean }),
  },
  {
    id: 'cyberpunk',
    label: 'Cyberpunk',
    group: 'Looks',
    description: 'Neon bloom over a hard glitch.',
    controls: [bool('animate', 'Animate', false)],
    build: (p) => cyberpunk({ animate: p.animate as boolean }),
  },
  {
    id: 'film',
    label: 'Film',
    group: 'Looks',
    description: 'Grain, halation and a gentle vignette.',
    controls: [],
    build: () => film(),
  },
  {
    id: 'newsprint',
    label: 'Newsprint',
    group: 'Looks',
    description: 'Coarse halftone on off-white stock.',
    controls: [],
    build: () => newsprint(),
  },
  {
    id: 'xerox',
    label: 'Xerox',
    group: 'Looks',
    description: 'Blown-out photocopy contrast.',
    controls: [],
    build: () => xerox(),
  },
  {
    id: 'riso',
    label: 'Riso',
    group: 'Looks',
    description: 'Two-ink risograph misprint.',
    controls: [color('shadow', 'Ink', '#12263a'), color('highlight', 'Paper', '#f4d35e')],
    build: (p) =>
      riso({ shadow: p.shadow as string, highlight: p.highlight as string }),
  },
  {
    id: 'neon',
    label: 'Neon',
    group: 'Looks',
    description: 'Tube glow traced around every edge.',
    controls: [color('color', 'Colour', '#ff2d55')],
    build: (p) => neon({ color: p.color as string }),
  },

  /* ------------------------------- Light ------------------------- */
  {
    id: 'bloom',
    label: 'Bloom',
    group: 'Light',
    description: 'Bright areas bleed light into their surroundings.',
    controls: [
      num('radius', 'Radius', 8, 0, 40, 0.5),
      num('threshold', 'Threshold', 0.55, 0, 1, 0.01),
      num('intensity', 'Intensity', 1.1, 0, 3, 0.05),
    ],
    build: (p) =>
      bloom({
        radius: p.radius as number,
        threshold: p.threshold as number,
        intensity: p.intensity as number,
      }),
  },
  {
    id: 'glow',
    label: 'Glow',
    group: 'Light',
    description: 'A coloured halo around the artwork.',
    controls: [
      color('color', 'Colour', '#ffffff'),
      num('radius', 'Radius', 6, 0, 40, 0.5),
      num('spread', 'Spread', 0, 0, 20, 0.5),
      num('intensity', 'Intensity', 1, 0, 3, 0.05),
    ],
    build: (p) =>
      glow({
        color: p.color as string,
        radius: p.radius as number,
        spread: p.spread as number,
        intensity: p.intensity as number,
      }),
  },
  {
    id: 'shadow',
    label: 'Drop shadow',
    group: 'Light',
    description: 'Offset shadow cast behind the artwork.',
    controls: [
      num('x', 'Offset X', 3, -40, 40, 1),
      num('y', 'Offset Y', 4, -40, 40, 1),
      num('blur', 'Blur', 4, 0, 40, 0.5),
      color('color', 'Colour', '#000000'),
      num('opacity', 'Opacity', 0.4, 0, 1, 0.01),
    ],
    build: (p) =>
      shadow({
        x: p.x as number,
        y: p.y as number,
        blur: p.blur as number,
        color: p.color as string,
        opacity: p.opacity as number,
      }),
  },
  {
    id: 'vignette',
    label: 'Vignette',
    group: 'Light',
    description: 'Darkens the edges toward the corners.',
    controls: [
      num('amount', 'Amount', 0.65, 0, 1, 0.01),
      num('radius', 'Radius', 0.6, 0, 1.5, 0.01),
      num('softness', 'Softness', 0.7, 0, 1, 0.01),
      color('color', 'Colour', '#000000'),
    ],
    build: (p) =>
      vignette({
        amount: p.amount as number,
        radius: p.radius as number,
        softness: p.softness as number,
        color: p.color as string,
      }),
  },
  {
    id: 'blur',
    label: 'Blur',
    group: 'Light',
    description: 'Gaussian blur, optionally on one axis only.',
    controls: [
      num('radius', 'Radius', 3, 0, 40, 0.5),
      choice('axis', 'Axis', 'both', ['both', 'horizontal', 'vertical']),
    ],
    build: (p) =>
      blur({ radius: p.radius as number, axis: p.axis as 'both' }),
  },
  {
    id: 'sharpen',
    label: 'Sharpen',
    group: 'Light',
    description: 'Convolution sharpen. Small amounts go a long way.',
    controls: [amount(1, 4)],
    build: (p) => sharpen({ amount: p.amount as number }),
  },
  {
    id: 'emboss',
    label: 'Emboss',
    group: 'Light',
    description: 'Fakes relief with a directional light.',
    controls: [
      num('depth', 'Depth', 1, 0, 5, 0.1),
      num('angle', 'Angle', 135, 0, 360, 1, { suffix: '°' }),
      bool('desaturate', 'Desaturate', true),
    ],
    build: (p) =>
      emboss({
        depth: p.depth as number,
        angle: p.angle as number,
        desaturate: p.desaturate as boolean,
      }),
  },

  /* ------------------------------- Colour ------------------------ */
  { id: 'grayscale', label: 'Grayscale', group: 'Colour', description: 'Drains the colour out.', controls: [amount(1, 1)], build: (p) => grayscale({ amount: p.amount as number }) },
  { id: 'saturate', label: 'Saturate', group: 'Colour', description: 'Pushes or pulls colour intensity.', controls: [amount(1.4, 4)], build: (p) => saturate({ amount: p.amount as number }) },
  { id: 'brightness', label: 'Brightness', group: 'Colour', description: 'Scales every channel.', controls: [amount(1.15, 3)], build: (p) => brightness({ amount: p.amount as number }) },
  { id: 'contrast', label: 'Contrast', group: 'Colour', description: 'Expands or compresses tonal range.', controls: [amount(1.25, 3)], build: (p) => contrast({ amount: p.amount as number }) },
  { id: 'sepia', label: 'Sepia', group: 'Colour', description: 'Warm monochrome wash.', controls: [amount(1, 1)], build: (p) => sepia({ amount: p.amount as number }) },
  { id: 'invert', label: 'Invert', group: 'Colour', description: 'Flips every channel.', controls: [amount(1, 1)], build: (p) => invert({ amount: p.amount as number }) },
  { id: 'fade', label: 'Fade', group: 'Colour', description: 'Lifts the blacks for a washed look.', controls: [amount(0.7, 1)], build: (p) => fade({ amount: p.amount as number }) },
  {
    id: 'hueRotate',
    label: 'Hue rotate',
    group: 'Colour',
    description: 'Spins the whole palette around the colour wheel.',
    controls: [num('angle', 'Angle', 90, 0, 360, 1, { suffix: '°' })],
    build: (p) => hueRotate({ angle: p.angle as number }),
  },
  {
    id: 'tint',
    label: 'Tint',
    group: 'Colour',
    description: 'Washes a single colour over everything.',
    controls: [color('color', 'Colour', '#ff2d55'), amount(0.45, 1)],
    build: (p) => tint({ color: p.color as string, amount: p.amount as number }),
  },
  {
    id: 'duotone',
    label: 'Duotone',
    group: 'Colour',
    description: 'Maps luminance onto two colours.',
    controls: [
      color('shadow', 'Shadow', '#12263a'),
      color('highlight', 'Highlight', '#f4d35e'),
      num('mix', 'Mix', 1, 0, 1, 0.01),
    ],
    build: (p) =>
      duotone({
        shadow: p.shadow as string,
        highlight: p.highlight as string,
        mix: p.mix as number,
      }),
  },
  {
    id: 'posterize',
    label: 'Posterize',
    group: 'Colour',
    description: 'Quantises each channel into bands.',
    controls: [
      num('steps', 'Steps', 5, 2, 16, 1),
      bool('includeAlpha', 'Include alpha', false),
    ],
    build: (p) =>
      posterize({
        steps: p.steps as number,
        includeAlpha: p.includeAlpha as boolean,
      }),
  },
  {
    id: 'threshold',
    label: 'Threshold',
    group: 'Colour',
    description: 'Hard cut to two colours at a luminance level.',
    controls: [
      num('level', 'Level', 0.5, 0, 1, 0.01),
      color('dark', 'Dark', '#000000'),
      color('light', 'Light', '#ffffff'),
    ],
    build: (p) =>
      threshold({
        level: p.level as number,
        dark: p.dark as string,
        light: p.light as string,
      }),
  },

  /* ------------------------------ Texture ------------------------ */
  {
    id: 'scanlines',
    label: 'Scanlines',
    group: 'Texture',
    description: 'Horizontal raster lines, like a CRT.',
    controls: [
      num('gap', 'Gap', 4, 1, 40, 0.5),
      num('thickness', 'Thickness', 1.5, 0.1, 20, 0.1),
      num('opacity', 'Opacity', 0.28, 0, 1, 0.01),
      color('color', 'Colour', '#000000'),
      num('angle', 'Angle', 0, 0, 360, 1, { suffix: '°' }),
      choice('blend', 'Blend', 'multiply', ['multiply', 'overlay', 'screen', 'normal']),
      ...ANIMATE(6, 60),
    ],
    build: (p) =>
      scanlines({
        gap: p.gap as number,
        thickness: p.thickness as number,
        opacity: p.opacity as number,
        color: p.color as string,
        angle: p.angle as number,
        blend: p.blend as 'multiply',
        animate: p.animate as boolean,
        speed: p.speed as number,
      }),
  },
  {
    id: 'grain',
    label: 'Grain',
    group: 'Texture',
    description: 'Film grain over the whole frame.',
    controls: [
      num('amount', 'Amount', 0.32, 0, 1, 0.01),
      num('size', 'Size', 0.8, 0.1, 5, 0.05),
      bool('monochrome', 'Monochrome', true),
      choice('blend', 'Blend', 'overlay', [
        'overlay',
        'multiply',
        'screen',
        'soft-light',
        'normal',
      ]),
      ...ANIMATE(12, 60),
    ],
    build: (p) =>
      grain({
        amount: p.amount as number,
        size: p.size as number,
        monochrome: p.monochrome as boolean,
        blend: p.blend as 'overlay',
        animate: p.animate as boolean,
        speed: p.speed as number,
      }),
  },
  {
    id: 'halftone',
    label: 'Halftone',
    group: 'Texture',
    description: 'Print-style dot screen.',
    controls: [
      num('size', 'Dot size', 6, 1, 40, 0.5),
      num('angle', 'Angle', 45, 0, 360, 1, { suffix: '°' }),
      num('levels', 'Levels', 4, 2, 16, 1),
      color('color', 'Ink', '#111111'),
      optionalColor('background', 'Paper', '#ffffff', 'Off leaves the paper transparent.'),
      bool('keepSource', 'Keep source', false),
    ],
    build: (p) =>
      halftone({
        size: p.size as number,
        angle: p.angle as number,
        levels: p.levels as number,
        color: p.color as string,
        background: p.background as string | null,
        keepSource: p.keepSource as boolean,
      }),
  },
  {
    id: 'pixelate',
    label: 'Pixelate',
    group: 'Texture',
    description: 'Quantises to square blocks.',
    controls: [num('size', 'Block size', 8, 1, 64, 1)],
    build: (p) => pixelate({ size: p.size as number }),
  },
  {
    id: 'outline',
    label: 'Outline',
    group: 'Texture',
    description: 'Traces a stroke around the artwork.',
    controls: [
      num('width', 'Width', 2, 0, 20, 0.5),
      color('color', 'Colour', '#000000'),
      choice('position', 'Position', 'outside', ['outside', 'inside']),
    ],
    build: (p) =>
      outline({
        width: p.width as number,
        color: p.color as string,
        position: p.position as 'outside',
      }),
  },

  /* ------------------------------ Distort ------------------------ */
  {
    id: 'chromaticAberration',
    label: 'Chromatic aberration',
    group: 'Distort',
    description: 'Splits the RGB channels apart.',
    controls: [
      num('offset', 'Offset', 2, 0, 20, 0.1),
      num('angle', 'Angle', 0, 0, 360, 1, { suffix: '°' }),
    ],
    build: (p) =>
      chromaticAberration({
        offset: p.offset as number,
        angle: p.angle as number,
      }),
  },
  {
    id: 'glitch',
    label: 'Glitch',
    group: 'Distort',
    description: 'Slices the image and shifts them sideways.',
    controls: [
      num('intensity', 'Intensity', 0.5, 0, 1, 0.01),
      num('slices', 'Slices', 7, 1, 40, 1),
      bool('colorShift', 'Colour shift', true),
      ...ANIMATE(1, 20),
    ],
    build: (p) =>
      glitch({
        intensity: p.intensity as number,
        slices: p.slices as number,
        colorShift: p.colorShift as boolean,
        animate: p.animate as boolean,
        speed: p.speed as number,
      }),
  },
  {
    id: 'wave',
    label: 'Wave',
    group: 'Distort',
    description: 'Ripples the artwork with turbulence.',
    controls: [
      num('amplitude', 'Amplitude', 12, 0, 80, 0.5),
      num('frequency', 'Frequency', 0.02, 0.001, 0.2, 0.001),
      num('octaves', 'Octaves', 2, 1, 6, 1),
      ...ANIMATE(0.15, 5),
    ],
    build: (p) =>
      wave({
        amplitude: p.amplitude as number,
        frequency: p.frequency as number,
        octaves: p.octaves as number,
        animate: p.animate as boolean,
        speed: p.speed as number,
      }),
  },
];

export const EFFECT_GROUPS: readonly EffectGroup[] = [
  'Looks',
  'Light',
  'Colour',
  'Texture',
  'Distort',
];

const BY_ID = new Map(EFFECTS.map((e) => [e.id, e]));

export const findEffect = (id: string): EffectDescriptor | undefined =>
  BY_ID.get(id);

/* ------------------------------------------------------------------ */
/*                            Stored config                          */
/* ------------------------------------------------------------------ */

/**
 * One entry in the user's effect stack. `params` holds only values that
 * differ from the descriptor's defaults, so a stack stays small and
 * automatically picks up a changed default on a library bump.
 */
export interface EffectConfig {
  /** Distinguishes two instances of the same effect in one stack. */
  uid: string;
  id: string;
  enabled: boolean;
  params: Record<string, ControlValue>;
}

export const defaultParams = (
  descriptor: EffectDescriptor,
): Record<string, ControlValue> =>
  Object.fromEntries(descriptor.controls.map((c) => [c.key, c.default]));

/** Descriptor defaults with the user's overrides applied on top. */
export const resolveParams = (
  descriptor: EffectDescriptor,
  params: Record<string, ControlValue>,
): Record<string, ControlValue> => ({
  ...defaultParams(descriptor),
  ...params,
});

/**
 * Turn a stored stack into the library's `Effect[]`.
 *
 * Order is preserved because it matters — the library composes effects as
 * a pipeline, so blur-then-threshold is not threshold-then-blur. Unknown
 * ids are skipped rather than thrown on, so a stack saved against a newer
 * library version still renders whatever it can.
 */
export const buildEffects = (stack: readonly EffectConfig[]): Effect[] => {
  const built: Effect[] = [];
  for (const entry of stack) {
    if (!entry.enabled) continue;
    const descriptor = BY_ID.get(entry.id);
    if (!descriptor) continue;
    built.push(descriptor.build(resolveParams(descriptor, entry.params)));
  }
  return built;
};

let counter = 0;
export const newEffectUid = (id: string): string =>
  `${id}-${Date.now().toString(36)}-${(counter++).toString(36)}`;
