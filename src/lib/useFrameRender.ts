import { useCallback, useEffect, useRef } from 'react';
import RenderWorker from './renderWorker?worker';
import type { FrameData } from 'dvdrw';
import type { WorkerResponse } from './renderWorker';
import type { RenderOptions } from '../stores/optionsStore';
import { useCustomThemesStore } from '../stores/customThemesStore';

export interface FrameRenderResult {
  svg: string;
  width: number;
  height: number;
  frameCount: number;
  durationMs: number;
}

/**
 * Emit — and later re-emit — an already-captured set of frames, off the main
 * thread.
 *
 * The container run can only happen on the main thread, but nothing about
 * turning its frames into an SVG needs to be there, and that is the part
 * that costs: emit + optimise + the vctrfx effect stack over the finished
 * document, long enough to lock the page on a real script. So the run hands
 * over frames and the worker produces every SVG, the first one included.
 *
 * Re-running the container for a colour change would also be executing the
 * user's shell commands again to produce pixels that don't depend on them,
 * so later visual changes are a `buildAnimation` over the held frames —
 * measured at well under a millisecond against ~1.2s for a rerun.
 */
export const useFrameRender = (
  onResult: (result: FrameRenderResult) => void,
) => {
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const tokenRef = useRef<string | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const customThemes = useCustomThemesStore((s) => s.themes);
  const customThemesRef = useRef(customThemes);
  customThemesRef.current = customThemes;

  useEffect(() => {
    const worker = new RenderWorker();
    workerRef.current = worker;

    const onMessage = (event: MessageEvent<WorkerResponse>) => {
      const data = event.data;
      // Only the newest request may paint: a burst of slider moves must
      // not have an earlier reply land last.
      if (data.id !== requestIdRef.current || !data.ok) return;
      onResultRef.current({
        svg: data.svg,
        width: data.width,
        height: data.height,
        frameCount: data.frameCount,
        durationMs: data.durationMs,
      });
    };

    worker.addEventListener('message', onMessage);
    return () => {
      worker.removeEventListener('message', onMessage);
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  /** Hand over the frames from a completed run and emit their SVG. */
  const publish = useCallback((frames: FrameData[], options: RenderOptions) => {
    const worker = workerRef.current;
    if (!worker) return;
    const token = `f${++requestIdRef.current}`;
    tokenRef.current = token;
    worker.postMessage({
      id: requestIdRef.current,
      kind: 'frames',
      token,
      frames,
      options,
      customThemes: customThemesRef.current,
    });
  }, []);

  /** Re-emit the held frames. No-op until `publish` has run. */
  const reemit = useCallback((options: RenderOptions) => {
    const worker = workerRef.current;
    const token = tokenRef.current;
    if (!worker || !token) return;
    worker.postMessage({
      id: ++requestIdRef.current,
      kind: 'reemit',
      token,
      options,
      customThemes: customThemesRef.current,
    });
  }, []);

  const hasFrames = useCallback(() => tokenRef.current !== null, []);

  return { publish, reemit, hasFrames };
};
