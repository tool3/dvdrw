import { useEffect, useRef, useState } from 'react';
import RenderWorker from './renderWorker?worker';
import type { RenderInput } from './render';
import type { WorkerResponse } from './renderWorker';
import type { RenderOptions } from '../stores/optionsStore';
import { useCustomThemesStore } from '../stores/customThemesStore';
import type { RenderState } from './types';

interface UseRenderArgs {
  input: RenderInput | null;
  options: RenderOptions;
  debounceMs?: number;
}

/**
 * Renders a script or cast file off the main thread via a Web Worker.
 *
 * UX shape (per user feedback):
 *  - Changing settings must never block the UI. The worker swallows
 *    the synchronous `renderInput` so the main thread keeps painting.
 *  - When a render is in flight, we flip state to `rendering` so the
 *    preview shows a spinner instead of a stale SVG.
 *  - Inputs are debounced by `debounceMs` (default 200ms) so dragging a
 *    slider doesn't fire a render on every keystroke. Only the final
 *    settled value posts to the worker.
 *  - Stale responses are dropped via a monotonic request id, so if
 *    the user keeps editing while a slow render is still running the
 *    eventual result of the *latest* edit wins.
 */
export const useRender = ({ input, options, debounceMs = 200 }: UseRenderArgs) => {
  const [state, setState] = useState<RenderState>({ status: 'idle' });
  const [notices, setNotices] = useState<string[]>([]);
  const requestIdRef = useRef(0);
  const workerRef = useRef<Worker | null>(null);
  // Subscribe so the dependency array re-fires when a theme is added /
  // edited / deleted — otherwise the worker would render with stale
  // custom-theme data.
  const customThemes = useCustomThemesStore((s) => s.themes);

  // Lifecycle: one worker per hook instance, terminated on unmount.
  // Module-import semantics + Vite's `?worker` give us a fresh Worker
  // class each time the bundle is evaluated; we just `new` it once.
  useEffect(() => {
    const worker = new RenderWorker();
    workerRef.current = worker;

    const onMessage = (event: MessageEvent<WorkerResponse>) => {
      const data = event.data;
      // Stale-response guard: only the latest request's reply is
      // applied. Earlier ones are dropped silently.
      if (data.id !== requestIdRef.current) return;
      if (data.ok) {
        setState({
          status: 'ok',
          result: {
            svg: data.svg,
            width: data.width,
            height: data.height,
            frameCount: data.frameCount,
            durationMs: data.durationMs,
          },
        });
        setNotices(data.notices);
      } else {
        setState({
          status: 'error',
          error: {
            message: data.message,
            hint: 'Try again, or check the source for syntax issues.',
          },
        });
        setNotices([]);
      }
    };

    worker.addEventListener('message', onMessage);
    return () => {
      worker.removeEventListener('message', onMessage);
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!input || (input.kind === 'script' && input.source.trim().length === 0)) {
      setState({ status: 'idle' });
      setNotices([]);
      return;
    }

    const handle = window.setTimeout(() => {
      const worker = workerRef.current;
      if (!worker) return;
      const id = ++requestIdRef.current;
      // Flip to `rendering` right when we post — gives instant visual
      // feedback (spinner) without flashing it on every intermediate
      // change inside the debounce window.
      setState({ status: 'rendering' });
      worker.postMessage({ id, input, options, customThemes });
    }, debounceMs);

    return () => {
      window.clearTimeout(handle);
    };
  }, [input, options, debounceMs, customThemes]);

  return { state, notices };
};
