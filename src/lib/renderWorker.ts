/**
 * Render worker — runs the synchronous `renderInput` off the main
 * thread so heavy cast files don't freeze the UI. Vite bundles this as
 * a Worker via the `?worker` suffix import in `useRender.ts`.
 *
 * Message protocol:
 *   in : { id: number; input: RenderInput; options: RenderOptions; customThemes: CustomTheme[] }
 *   out: { id: number; ok: true; svg, width, height, frameCount, durationMs, notices }
 *      | { id: number; ok: false; message: string }
 *
 * `id` lets the caller correlate responses with requests and drop
 * stale results when the user keeps editing.
 */

import type { RenderInput } from './render';
import { renderInput } from './render';
import type { RenderOptions } from '../stores/optionsStore';
import type { CustomTheme } from '../stores/customThemesStore';

interface WorkerRequest {
  id: number;
  input: RenderInput;
  options: RenderOptions;
  customThemes: CustomTheme[];
}

interface WorkerSuccess {
  id: number;
  ok: true;
  svg: string;
  width: number;
  height: number;
  frameCount: number;
  durationMs: number;
  notices: string[];
}

interface WorkerFailure {
  id: number;
  ok: false;
  message: string;
}

export type WorkerResponse = WorkerSuccess | WorkerFailure;

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const { id, input, options, customThemes } = event.data;
  try {
    const result = renderInput(input, options, customThemes);
    const response: WorkerSuccess = {
      id,
      ok: true,
      svg: result.svg,
      width: result.width,
      height: result.height,
      frameCount: result.frameCount,
      durationMs: result.durationMs,
      notices: result.notices,
    };
    (self as unknown as Worker).postMessage(response);
  } catch (err) {
    const response: WorkerFailure = {
      id,
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
    (self as unknown as Worker).postMessage(response);
  }
});
