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
 * Re-emit an already-captured set of frames with new options, off the main
 * thread.
 *
 * The container run can only happen on the main thread, but re-running it
 * for a colour change was executing the user's shell commands again to
 * produce pixels that don't depend on them. Frames are handed to the worker
 * once per run; every later visual change is a `buildAnimation` over those
 * frames — measured at well under a millisecond against ~1.2s for a rerun.
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

  /** Hand over the frames from a completed run. */
  const publish = useCallback((frames: FrameData[]) => {
    const worker = workerRef.current;
    if (!worker) return;
    const token = `f${++requestIdRef.current}`;
    tokenRef.current = token;
    worker.postMessage({ id: requestIdRef.current, kind: 'frames', token, frames });
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
