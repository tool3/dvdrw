import { useEffect, useRef, useState } from 'react';
import type { RenderInput, RenderOutput } from './render';
import { renderInput } from './render';
import type { RenderOptions } from '../stores/optionsStore';
import type { RenderState } from './types';

interface UseRenderArgs {
  input: RenderInput | null;
  options: RenderOptions;
  debounceMs?: number;
}

export const useRender = ({ input, options, debounceMs = 200 }: UseRenderArgs) => {
  const [state, setState] = useState<RenderState>({ status: 'idle' });
  const [notices, setNotices] = useState<string[]>([]);
  const tokenRef = useRef(0);

  useEffect(() => {
    if (!input || (input.kind === 'script' && input.source.trim().length === 0)) {
      setState({ status: 'idle' });
      setNotices([]);
      return;
    }

    setState((prev) =>
      prev.status === 'ok' ? prev : { status: 'rendering' },
    );

    const myToken = ++tokenRef.current;
    const handle = window.setTimeout(() => {
      try {
        const result: RenderOutput = renderInput(input, options);
        if (myToken !== tokenRef.current) return;
        setState({
          status: 'ok',
          result: {
            svg: result.svg,
            width: result.width,
            height: result.height,
            frameCount: result.frameCount,
            durationMs: result.durationMs,
          },
        });
        setNotices(result.notices);
      } catch (err) {
        if (myToken !== tokenRef.current) return;
        setState({
          status: 'error',
          error: {
            message: err instanceof Error ? err.message : 'Render failed',
            hint: input.kind === 'cast' ? 'Make sure the file is a valid asciinema cast.' : undefined,
          },
        });
        setNotices([]);
      }
    }, debounceMs);

    return () => {
      window.clearTimeout(handle);
    };
  }, [input, options, debounceMs]);

  return { state, notices };
};
