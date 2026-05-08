import type { RenderOptions } from '../stores/optionsStore';

export interface RenderResult {
  svg: string;
  width: number;
  height: number;
  frameCount: number;
  durationMs: number;
}

export interface RenderError {
  message: string;
  hint?: string;
}

export type RenderState =
  | { status: 'idle' }
  | { status: 'rendering' }
  | { status: 'ok'; result: RenderResult }
  | { status: 'error'; error: RenderError };

export type { RenderOptions };
