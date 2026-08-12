import type { RenderOptions } from '../stores/optionsStore';
import type { CustomTheme } from '../stores/customThemesStore';

/** A full 16-colour palette, minus the id the store assigns. */
export type PresetPalette = Omit<CustomTheme, 'id'>;

export interface Preset {
  id: string;
  name: string;
  description: string;
  swatch: { from: string; to: string };
  patch: Partial<RenderOptions>;
  /**
   * Palette this preset needs, when no built-in theme has the right look
   * — a green phosphor screen has a *green foreground*, which none of the
   * 37 built-ins do. Registered in the custom-theme library under a
   * stable id on first use, so applying a preset twice reuses the same
   * entry instead of stacking duplicates.
   */
  palette?: PresetPalette;
}

/** Stable, collision-proof id for a preset's palette. Must start with
 *  `custom-` — that prefix is how `resolveTheme` knows to look in the
 *  custom-theme library rather than the built-ins. */
export const presetPaletteId = (presetId: string): string =>
  `custom-preset-${presetId}`;

/**
 * Applied underneath every preset's own patch.
 *
 * Presets merge into the current options rather than replacing them, so a
 * border left over from a previous look would survive into a preset that
 * never asked for one — and a hairline around the window spoils every one
 * of these. Clearing it here keeps that guarantee in a single place
 * instead of repeating `borderWidth: 0` twelve times.
 */
export const PRESET_BASELINE: Partial<RenderOptions> = {
  borderWidth: 0,
  borderColor: undefined,
};

/**
 * Which preset the current options correspond to, or null once the user
 * has customised away from all of them.
 *
 * A preset only declares the keys it cares about, so a match means every
 * key it *does* declare still holds — not that the whole options object is
 * equal. That in turn means a sparse preset can be a subset of a richer
 * one (`Bare` sets five keys, several others set those same five plus
 * more), so the most specific match wins rather than the first.
 */
export const matchPreset = (options: RenderOptions): string | null => {
  let best: { id: string; keys: number } | null = null;
  for (const preset of PRESETS) {
    const keys = Object.keys(preset.patch) as Array<keyof RenderOptions>;
    const matches = keys.every((key) =>
      Object.is(options[key], preset.patch[key]),
    );
    if (matches && (!best || keys.length > best.keys)) {
      best = { id: preset.id, keys: keys.length };
    }
  }
  return best?.id ?? null;
};

export const PRESETS: Preset[] = [
  {
    id: 'midnight',
    name: 'Midnight',
    description: 'True-black canvas, dracula terminal, soft glow.',
    swatch: { from: '#0a0a0f', to: '#1a1330' },
    patch: {
      theme: 'dracula',
      template: 'macos',
      background: 'gradient(#0a0a0f, #1a1330:vertical)',
      backgroundPadding: 48,
      backgroundRadius: 18,
      borderRadius: 14,
      padding: 18,
      cursorStyle: 'block',
    },
  },
  {
    id: 'aurora',
    name: 'Aurora',
    description: 'Cool gradient, github-dark terminal, balanced spacing.',
    swatch: { from: '#1a3a5c', to: '#0f4d6e' },
    patch: {
      theme: 'githubDark',
      template: 'macos',
      background: 'gradient(#1a3a5c, #0f4d6e:diagonal)',
      backgroundPadding: 56,
      backgroundRadius: 20,
      borderRadius: 12,
      padding: 16,
    },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    description: 'Warm gradient, monokai terminal, photo-style framing.',
    swatch: { from: '#ff7a59', to: '#7c2bff' },
    patch: {
      theme: 'monokai',
      template: 'macos',
      background: 'gradient(#ff7a59, #7c2bff:diagonal)',
      backgroundPadding: 64,
      backgroundRadius: 24,
      borderRadius: 16,
      padding: 18,
    },
  },
  {
    id: 'paper',
    name: 'Paper',
    description: 'Soft light background, github-light terminal.',
    swatch: { from: '#f3eee2', to: '#e8e1cf' },
    patch: {
      theme: 'githubLight',
      template: 'macos',
      background: 'gradient(#f3eee2, #e8e1cf:vertical)',
      backgroundPadding: 48,
      backgroundRadius: 18,
      borderRadius: 12,
      padding: 16,
    },
  },
  {
    id: 'bare',
    name: 'Bare',
    description: 'No frame, no chrome — pure terminal output.',
    swatch: { from: '#101010', to: '#101010' },
    patch: {
      template: 'minimal',
      background: undefined,
      backgroundPadding: 0,
      borderRadius: 0,
      padding: 12,
    },
  },
  {
    id: 'panel',
    name: 'Panel',
    description: 'Plain elevated panel, no gradient noise.',
    swatch: { from: '#161618', to: '#161618' },
    patch: {
      theme: 'tokyoNight',
      template: 'macos',
      background: '#161618',
      backgroundPadding: 40,
      backgroundRadius: 14,
      borderRadius: 10,
      padding: 14,
    },
  },

  /* ---------------------------------------------------------------- */
  /*                          Character pieces                        */
  /* ---------------------------------------------------------------- */

  {
    id: 'vintage-monitor',
    name: 'Vintage Monitor',
    description: 'Green phosphor screen bolted into a beige office bezel.',
    swatch: { from: '#C9C7AF', to: '#0D0208' },
    patch: {
      theme: presetPaletteId('vintage-monitor'),
      template: 'minimal',
      background: '#C9C7AF',
      backgroundPadding: 50,
      backgroundRadius: 24,
      borderRadius: 10,
      padding: 22,
      cursorStyle: 'bar',
      cursorColor: '#00ff9f',
      loopStyle: 'fade',
    },
    palette: {
      name: 'Vintage Monitor',
      background: '#0D0208', foreground: '#00ff9f',
      cursor: '#00ff9f', selection: '#083b2c',
      black: '#0b1a14', red: '#ff2e63', green: '#00ff9f', yellow: '#8fff5a',
      blue: '#00d4ff', magenta: '#5affc8', cyan: '#00ffd5', white: '#b9ffe4',
      brightBlack: '#1f4a3a', brightRed: '#ff5c8a', brightGreen: '#50ffb8',
      brightYellow: '#b6ff8a', brightBlue: '#33e5ff', brightMagenta: '#8affd9',
      brightCyan: '#66ffe8', brightWhite: '#e6fff5',
    },
  },
  {
    id: 'amber-crt',
    name: 'Amber CRT',
    description: 'Warm amber phosphor. The other 1979 monitor.',
    swatch: { from: '#2b2016', to: '#ffb000' },
    patch: {
      theme: presetPaletteId('amber-crt'),
      template: 'minimal',
      background: 'gradient(#3a2c1c, #17110a:diagonal)',
      backgroundPadding: 46,
      backgroundRadius: 22,
      borderRadius: 10,
      padding: 22,
      cursorStyle: 'block',
      cursorColor: '#ffb000',
      loopStyle: 'fade',
    },
    palette: {
      name: 'Amber CRT',
      background: '#140d05', foreground: '#ffb000',
      cursor: '#ffb000', selection: '#4a3208',
      black: '#1a1206', red: '#ff6b35', green: '#ffc233', yellow: '#ffd166',
      blue: '#d98b00', magenta: '#ff8f40', cyan: '#ffcf7a', white: '#ffe3b0',
      brightBlack: '#5c4514', brightRed: '#ff8c5a', brightGreen: '#ffd75f',
      brightYellow: '#ffe08a', brightBlue: '#ffab4d', brightMagenta: '#ffb066',
      brightCyan: '#ffdfa3', brightWhite: '#fff3dc',
    },
  },
  {
    id: 'matrix',
    name: 'Matrix',
    description: 'Pure black, falling-code green. No chrome, no mercy.',
    swatch: { from: '#000000', to: '#00ff41' },
    patch: {
      theme: presetPaletteId('matrix'),
      template: 'minimal',
      background: '#000000',
      backgroundPadding: 24,
      backgroundRadius: 0,
      borderRadius: 0,
      padding: 20,
      cursorStyle: 'block',
      cursorColor: '#00ff41',
      loopStyle: 'loop',
    },
    palette: {
      name: 'Matrix',
      background: '#000000', foreground: '#00ff41',
      cursor: '#00ff41', selection: '#003b12',
      black: '#000000', red: '#00b32d', green: '#00ff41', yellow: '#5cff7a',
      blue: '#008f24', magenta: '#00e63a', cyan: '#39ff6f', white: '#9dffb4',
      brightBlack: '#00591a', brightRed: '#33ff66', brightGreen: '#66ff8f',
      brightYellow: '#8affa4', brightBlue: '#00cc33', brightMagenta: '#4dff77',
      brightCyan: '#7dffa0', brightWhite: '#d6ffe0',
    },
  },
  {
    id: 'synthwave',
    name: 'Synthwave',
    description: 'Miami sunset gradient and a neon grid horizon.',
    swatch: { from: '#ff2e97', to: '#2b1055' },
    patch: {
      theme: 'synthwave84',
      template: 'macos',
      background: 'gradient(#2b1055, #ff2e97:diagonal)',
      backgroundPadding: 60,
      backgroundRadius: 20,
      borderRadius: 14,
      padding: 18,
      cursorStyle: 'bar',
      cursorColor: '#03edf9',
    },
  },
  {
    id: 'vaporwave',
    name: 'Vaporwave',
    description: 'A E S T H E T I C. Pink, teal, and no explanation.',
    swatch: { from: '#ff71ce', to: '#01cdfe' },
    patch: {
      theme: 'shadesOfPurple',
      template: 'windows',
      background: 'gradient(#ff71ce, #01cdfe, #05ffa1:diagonal)',
      backgroundPadding: 64,
      backgroundRadius: 4,
      borderRadius: 2,
      padding: 18,
      cursorStyle: 'block',
      cursorColor: '#fffb96',
    },
  },
  {
    id: 'hotdog-stand',
    name: 'Hotdog Stand',
    description: 'The Windows 3.1 war crime, faithfully reissued.',
    swatch: { from: '#ff0000', to: '#ffff00' },
    patch: {
      theme: presetPaletteId('hotdog-stand'),
      template: 'windows',
      background: '#ffff00',
      backgroundPadding: 36,
      backgroundRadius: 0,
      borderRadius: 0,
      padding: 16,
      cursorStyle: 'block',
      cursorColor: '#000000',
    },
    palette: {
      name: 'Hotdog Stand',
      background: '#ff0000', foreground: '#ffff00',
      cursor: '#000000', selection: '#000000',
      black: '#000000', red: '#ffff00', green: '#ffffff', yellow: '#ffff00',
      blue: '#ffffff', magenta: '#ffff00', cyan: '#ffffff', white: '#ffffff',
      brightBlack: '#3f3f3f', brightRed: '#ffff66', brightGreen: '#ffffff',
      brightYellow: '#ffff99', brightBlue: '#ffffff', brightMagenta: '#ffff66',
      brightCyan: '#ffffff', brightWhite: '#ffffff',
    },
  },
];
