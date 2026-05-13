/**
 * Render worker — runs the synchronous `renderInput` off the main
 * thread so heavy cast files don't freeze the UI. Vite bundles this as
 * a Worker via the `?worker` suffix import in `useRender.ts`.
 *
 * Two-tier caching for cast renders:
 *
 *   1. **Snapshot cache** (keyed by `source` only). Walking a 700KB+
 *      cast through the virtual terminal — the slow step — produces
 *      theme-independent grid states. We cache those. Loading a new
 *      cast invalidates this tier; everything else reuses it.
 *
 *   2. **Frame cache** (keyed by `source + themeKey`). Coalescing each
 *      cached grid snapshot into themed row-spans is much cheaper
 *      than the replay. Theme changes invalidate this tier but keep
 *      the snapshot cache, so an inline theme switch only pays for
 *      the coalesce + the SVG emit. Pure visual changes
 *      (padding / border / font / playback speed / …) reuse this
 *      tier as-is and only re-run `buildAnimation`.
 *
 * Message protocol:
 *   in : { id: number; input: RenderInput; options: RenderOptions; customThemes: CustomTheme[] }
 *   out: { id: number; ok: true; svg, width, height, frameCount, durationMs, notices }
 *      | { id: number; ok: false; message: string }
 */

import type { FrameData } from 'dvdrw';
import type { GridSnapshot, RenderInput } from './render';
import {
  buildAnimation,
  framesFromSnapshots,
  playCastSnapshots,
  renderInput,
  resolveTheme,
} from './render';
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

let snapshotCache: { source: string; snapshots: GridSnapshot[] } | null = null;
let frameCache: {
  source: string;
  themeKey: string;
  frames: FrameData[];
} | null = null;

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const { id, input, options, customThemes } = event.data;
  try {
    if (input.kind === 'cast') {
      const themeKey = options.theme;
      const theme = resolveTheme(themeKey, customThemes);

      // Tier 1: snapshots. Walking the cast through vterminal is the
      // most expensive step and is theme-independent, so we cache it
      // by source alone.
      let snapshots: GridSnapshot[];
      if (snapshotCache && snapshotCache.source === input.source) {
        snapshots = snapshotCache.snapshots;
      } else {
        snapshots = playCastSnapshots(input.source);
        snapshotCache = { source: input.source, snapshots };
        // A new cast invalidates any old frame cache too — themeKey
        // alone wouldn't catch a source swap that re-uses the same
        // theme id.
        frameCache = null;
      }

      // Tier 2: themed frames. Cheap to recompute from snapshots when
      // only the theme changes. Pure-visual option changes (padding,
      // border, font size, …) reuse this tier entirely.
      let frames: FrameData[];
      if (
        frameCache &&
        frameCache.source === input.source &&
        frameCache.themeKey === themeKey
      ) {
        frames = frameCache.frames;
      } else {
        frames = framesFromSnapshots(snapshots, theme);
        frameCache = { source: input.source, themeKey, frames };
      }

      const result = buildAnimation(frames, options, theme);
      const response: WorkerSuccess = {
        id,
        ok: true,
        svg: result.svg,
        width: result.width,
        height: result.height,
        frameCount: result.frameCount,
        durationMs: result.durationMs,
        notices: [],
      };
      (self as unknown as Worker).postMessage(response);
      return;
    }

    // Script path — falls back to the all-in-one render. No cache
    // here yet; the interpreter state would need cacheing too.
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
