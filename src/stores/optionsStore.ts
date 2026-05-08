import { create } from 'zustand';

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

  // Frame chrome
  borderRadius: number;
  borderWidth: number;
  borderColor?: string;

  // Cursor
  cursorStyle: CursorStyle;
  cursorBlink: boolean;
  cursorColor?: string;

  // Background (gradient or solid wrapping the terminal)
  background?: string;
  backgroundPadding: number;
  backgroundRadius: number;

  // Animation
  fps: number;
  loop: boolean;
  loopStyle: LoopStyle;
  pauseAtEnd: number;

  // Output
  engine: RenderEngine;
  optimize: boolean;
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

  borderRadius: 12,
  borderWidth: 0,
  borderColor: undefined,

  cursorStyle: 'block',
  cursorBlink: true,
  cursorColor: undefined,

  background: undefined,
  backgroundPadding: 32,
  backgroundRadius: 16,

  fps: 30,
  loop: true,
  loopStyle: 'loop',
  pauseAtEnd: 1000,

  engine: 'filmstrip',
  optimize: true,
};

interface OptionsState {
  options: RenderOptions;
  set: <K extends keyof RenderOptions>(key: K, value: RenderOptions[K]) => void;
  reset: () => void;
  applyPartial: (patch: Partial<RenderOptions>) => void;
}

export const useOptionsStore = create<OptionsState>((set) => ({
  options: DEFAULT_OPTIONS,
  set: (key, value) =>
    set((state) => ({ options: { ...state.options, [key]: value } })),
  reset: () => set({ options: DEFAULT_OPTIONS }),
  applyPartial: (patch) =>
    set((state) => ({ options: { ...state.options, ...patch } })),
}));
