import { create } from 'zustand';
import { useAppStore, type View } from './appStore';
import type { EffectConfig } from '../lib/effects';

export type TemplateKind = 'macos' | 'windows' | 'minimal';
export type CursorStyle = 'block' | 'bar' | 'underline';
export type LoopStyle = 'loop' | 'reverse' | 'rewind' | 'fade';
export type RenderEngine = 'filmstrip' | 'smil';

export interface RenderOptions {
  // Identity
  theme: string;
  template: TemplateKind;
  title?: string;
  watermark?: string;

  // Type & layout
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  padding: number;

  // Terminal dimensions — undefined means "auto-fit content"; setting
  // either field pins that dimension to an explicit px value. Mirrors
  // dvd-cli's `Set Width` / `Set Height` directives.
  width?: number;
  height?: number;

  // Frame chrome
  borderRadius: number;
  borderWidth: number;
  borderColor?: string;

  // Cursor
  cursorStyle: CursorStyle;
  cursorBlink: boolean;
  cursorColor?: string;
  /** Render the cursor at all. dvd-cli has no global flag for this, so when
   *  false the runner injects a `\e[?25l` sequence before capture starts. */
  cursorVisible: boolean;

  // Background (gradient or solid wrapping the terminal)
  background?: string;
  backgroundPadding: number;
  backgroundRadius: number;

  // Animation
  fps: number;
  loop: boolean;
  loopStyle: LoopStyle;
  pauseAtEnd: number;
  /** Pause (ms) before the loop restarts. Only used when `loop` is true. */
  loopPause: number;
  /** Cross-fade duration (ms). Only meaningful when `loopStyle === 'fade'`. */
  fadeDuration: number;
  /** Speed multiplier for the rewind phase of `loopStyle === 'rewind'`. */
  rewindSpeed: number;
  /** Global timeline multiplier — 0.5 = half speed, 2 = double speed. */
  playbackSpeed: number;

  // Output
  engine: RenderEngine;
  optimize: boolean;
  /** Render block-drawing glyphs (▀▄█) as geometric SVG shapes instead
   *  of relying on the font's coverage. Cleaner across font stacks. */
  customGlyphs: boolean;
  /**
   * Post-processing stack applied to the finished SVG via
   * `@svgfx/postprocessing`. Lives on RenderOptions so it reaches the
   * worker and the container runner through the same channel every other
   * option does, and so an edit triggers the usual auto-rerender. It has
   * no `.cd` equivalent — the CLI has no effects — so it is deliberately
   * absent from SYNCABLE_KEYS and never written to the script.
   */
  effects: EffectConfig[];
}

export const DEFAULT_OPTIONS: RenderOptions = {
  theme: 'dracula',
  template: 'macos',
  title: 'dvdrw',
  watermark: undefined,

  fontSize: 14,
  lineHeight: 1.4,
  letterSpacing: 0,
  padding: 16,

  width: undefined,
  height: undefined,

  borderRadius: 12,
  borderWidth: 0,
  borderColor: undefined,

  cursorStyle: 'block',
  cursorBlink: false,
  cursorColor: undefined,
  cursorVisible: true,

  background: undefined,
  backgroundPadding: 32,
  backgroundRadius: 16,

  fps: 30,
  loop: true,
  loopStyle: 'loop',
  pauseAtEnd: 1000,
  loopPause: 0,
  fadeDuration: 1500,
  rewindSpeed: 5,
  playbackSpeed: 1,

  engine: 'filmstrip',
  optimize: true,
  customGlyphs: true,
  effects: [],
};

/**
 * Each view (script editor / cast import) owns an independent set of
 * render options. The active view's options are mirrored to the top-level
 * `options` field so existing consumers can read `s.options` without
 * knowing which view they're in; the `set`/`reset`/`applyPartial`
 * mutators write to whichever view is active at the moment.
 *
 * Switching views via `appStore.view` swaps which slot `options` reflects,
 * keyed off the subscription at the bottom of this file.
 */
interface OptionsState {
  byView: Record<View, RenderOptions>;
  /** Mirror of `byView[activeView]`. Updated by:
   *  - mutators (`set`, `reset`, `applyPartial`) when the active view's
   *    slot changes,
   *  - the appStore subscription below when the view itself changes. */
  options: RenderOptions;
  set: <K extends keyof RenderOptions>(key: K, value: RenderOptions[K]) => void;
  reset: () => void;
  applyPartial: (patch: Partial<RenderOptions>) => void;
}

export const useOptionsStore = create<OptionsState>((set) => ({
  byView: {
    script: DEFAULT_OPTIONS,
    cast: DEFAULT_OPTIONS,
  },
  options: DEFAULT_OPTIONS,
  set: (key, value) => {
    const view = useAppStore.getState().view;
    set((state) => {
      const next = { ...state.byView[view], [key]: value };
      return {
        byView: { ...state.byView, [view]: next },
        options: next,
      };
    });
  },
  reset: () => {
    const view = useAppStore.getState().view;
    set((state) => ({
      byView: { ...state.byView, [view]: DEFAULT_OPTIONS },
      options: DEFAULT_OPTIONS,
    }));
  },
  applyPartial: (patch) => {
    const view = useAppStore.getState().view;
    set((state) => {
      const next = { ...state.byView[view], ...patch };
      return {
        byView: { ...state.byView, [view]: next },
        options: next,
      };
    });
  },
}));

// Whenever the active view changes, point `options` at the corresponding
// slot. Subscribers reading `s.options` re-render with the new view's
// values without any extra wiring. Tracking prevView manually to stay
// compatible across Zustand subscribe overloads.
let prevView: View | null = useAppStore.getState().view;
useAppStore.subscribe((state) => {
  if (state.view === prevView) return;
  prevView = state.view;
  useOptionsStore.setState((s) => ({ options: s.byView[state.view] }));
});
