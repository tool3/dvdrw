/**
 * MP4 export in the browser.
 *
 * The animated SVG we render is SMIL, and nothing rasterizes SMIL — canvas
 * `drawImage` of an animated SVG gives you frame zero and nothing else. So
 * the video is built from the same `FrameData[]` the animation came from:
 * the lib's `planVideo()` resamples it onto a constant frame rate and emits
 * one standalone static SVG per output frame, each of which *is* safely
 * rasterizable. From there it's canvas → WebCodecs → mp4-muxer.
 *
 * WebCodecs is Chromium-only, which costs us nothing: the runner already
 * requires a Chromium browser with cross-origin isolation for WebContainers.
 * `isVideoExportSupported()` gates the UI everywhere else.
 *
 * On fonts: the frames deliberately do NOT embed one. An SVG loaded as an
 * image is an isolated document that can't reach page fonts, but the emitted
 * stylesheet ends in a generic `monospace`, which the browser resolves to
 * the same default the on-page preview uses. Embedding a webfont here would
 * actually make the video match the preview *less* well, not more.
 */

import { VIDEO_QUALITY } from 'dvdrw';
import type { FrameData, VideoPlan, VideoQuality } from 'dvdrw';
import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import { buildVideoPlan, resolveTheme } from './render';
import type { RenderOptions } from '../stores/optionsStore';
import type { CustomTheme } from '../stores/customThemesStore';

/**
 * Frame rate for exported video when the caller pins one. Left undefined,
 * the quality tier decides — `high` derives the highest rate the recording
 * can actually fill. Do not default this to a number: passing one through
 * would silently override every tier.
 */
export const DEFAULT_VIDEO_FPS: number | undefined = undefined;

export const VIDEO_QUALITY_LABELS: Array<{
  value: VideoQuality;
  label: string;
  hint: string;
}> = [
  {
    value: 'low',
    label: 'Low',
    hint: `Smallest file, quickest export — ${VIDEO_QUALITY.low.fps}fps`,
  },
  {
    value: 'medium',
    label: 'Medium',
    hint: `Matches the SVG pixel for pixel — ${VIDEO_QUALITY.medium.fps}fps`,
  },
  {
    value: 'high',
    label: 'High',
    // Read the numbers off the preset so the tooltip can't drift from it.
    hint:
      `${VIDEO_QUALITY.high.scale}x supersampled at the recording's own frame ` +
      'rate — as crisp as the SVG, even zoomed',
  },
];

export interface EncodeVideoOptions {
  frames: FrameData[];
  options: RenderOptions;
  customThemes?: CustomTheme[];
  fps?: number;
  /** Times the animation repeats. Default 1. */
  loops?: number;
  /** Detail tier. Default `medium`. */
  quality?: VideoQuality;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

export interface EncodedVideo {
  blob: Blob;
  width: number;
  height: number;
  frameCount: number;
  durationMs: number;
}

/**
 * Everything the export path needs beyond a plain modern browser. Checked
 * up front so the button can be hidden rather than throwing on click.
 */
export const isVideoExportSupported = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.VideoEncoder === 'function' &&
  typeof window.VideoFrame === 'function' &&
  typeof OffscreenCanvas === 'function';

/**
 * Decode one static SVG into something drawable.
 *
 * `HTMLImageElement` + a blob URL rather than `createImageBitmap(blob)`:
 * Chromium's `createImageBitmap` support for SVG blobs has been
 * inconsistent, whereas an `<img>` has decoded SVG reliably forever. The
 * SVG carries explicit width/height attributes, so it rasterizes at its
 * intrinsic size with no scaling guesswork.
 */
const decodeSvg = async (svg: string): Promise<HTMLImageElement> => {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    // Safe to revoke immediately after decode() — the bitmap is retained.
    URL.revokeObjectURL(url);
  }
};

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
};

/**
 * AVC codec strings ordered by increasing capability.
 *
 * The level (the last byte) caps how many macroblocks a frame may contain,
 * and a frame that exceeds it is rejected outright. Level 4.2 allows 8704
 * — comfortably enough at 1x, but a 3x supersampled frame blows straight
 * past it, so a hardcoded level would make the `high` tier fail on exactly
 * the canvases it exists for.
 *
 *   avc1.42002a  Constrained Baseline 4.2  —  8704 MBs  (~1920x1088)
 *   avc1.4d0033  Main 5.1                  — 36864 MBs  (~4096x2304)
 *   avc1.640034  High 5.2                  — 36864 MBs
 *   avc1.64003c  High 6.0                  — huge
 */
const AVC_CANDIDATES = [
  'avc1.42002a',
  'avc1.4d0033',
  'avc1.640034',
  'avc1.64003c',
] as const;

/**
 * Pick the first codec the browser will actually accept for this frame
 * size. Asking beats guessing: level limits, hardware vs software support
 * and profile availability all vary by machine.
 */
const pickAvcCodec = async (
  width: number,
  height: number,
  framerate: number,
  bitrate: number,
): Promise<string | null> => {
  for (const codec of AVC_CANDIDATES) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec,
        width,
        height,
        framerate,
        bitrate,
      });
      if (support.supported) return codec;
    } catch {
      // Malformed-for-this-browser codec string; try the next one.
    }
  }
  // Null rather than a hopeful guess: the caller steps the scale down and
  // asks again, which is far better than letting configure() blow up.
  return null;
};

const bitrateFor = (plan: VideoPlan, width: number, height: number): number =>
  Math.max(
    600_000,
    Math.round(width * height * (plan.encoding?.bitsPerPixel ?? 4)),
  );

/**
 * Encode a plan to MP4 (H.264 + yuv420p, the combination every browser and
 * player actually decodes).
 */
const encodePlan = async (
  plan: VideoPlan,
  codec: string,
  opts: { onProgress?: (done: number, total: number) => void; signal?: AbortSignal },
): Promise<EncodedVideo> => {
  // Decode the first frame before sizing anything. The emitted SVG's real
  // canvas is not the size the emitter was asked for — background padding
  // and watermark overflow grow it — so the decoded image's intrinsic size
  // is the only trustworthy number. Getting this wrong is what produced
  // the squashed video: a 800x500 frame stretched into a 700x300 canvas.
  const sequence = plan.frames();
  const first = sequence.next();
  if (first.done) throw new Error('No frames to encode.');

  const firstImg = await decodeSvg(first.value.svg);
  const frameWidth = Math.ceil(firstImg.naturalWidth || plan.width);
  const frameHeight = Math.ceil(firstImg.naturalHeight || plan.height);
  // H.264 in yuv420p subsamples chroma 2x2 and rejects odd dimensions.
  const width = frameWidth + (frameWidth % 2);
  const height = frameHeight + (frameHeight % 2);

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Could not get a 2D canvas context for encoding.');

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width, height },
    // Everything is in memory anyway, and this puts the moov atom up front
    // so the file starts playing without a full download.
    fastStart: 'in-memory',
  });

  let encodeError: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (err) => {
      encodeError = err instanceof Error ? err : new Error(String(err));
    },
  });

  encoder.configure({
    codec,
    width,
    height,
    framerate: plan.fps,
    bitrate: bitrateFor(plan, width, height),
  });

  const microsPerFrame = 1_000_000 / plan.fps;

  // Paint the frame at its own size, never stretched to the canvas, then
  // extend the outermost row/column across the at-most-one-pixel gap to
  // the even edge. Leaving it unpainted shows as a black hairline on a
  // light theme; scaling to fill would resample every glyph.
  const paint = (img: HTMLImageElement) => {
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, frameWidth, frameHeight);
    const padX = width - frameWidth;
    const padY = height - frameHeight;
    if (padX > 0) {
      ctx.drawImage(img, frameWidth - 1, 0, 1, frameHeight, frameWidth, 0, padX, frameHeight);
    }
    if (padY > 0) {
      ctx.drawImage(img, 0, frameHeight - 1, frameWidth, 1, 0, frameHeight, frameWidth, padY);
    }
    if (padX > 0 && padY > 0) {
      ctx.drawImage(img, frameWidth - 1, frameHeight - 1, 1, 1, frameWidth, frameHeight, padX, padY);
    }
  };

  const submit = (index: number) => {
    const videoFrame = new VideoFrame(canvas, {
      timestamp: Math.round(index * microsPerFrame),
      duration: Math.round(microsPerFrame),
    });
    // A keyframe every couple of seconds keeps seeking usable without
    // bloating the file.
    encoder.encode(videoFrame, { keyFrame: index % (plan.fps * 2) === 0 });
    videoFrame.close();
  };

  try {
    paint(firstImg);
    submit(first.value.index);
    opts.onProgress?.(1, plan.frameCount);

    for (let next = sequence.next(); !next.done; next = sequence.next()) {
      const frame = next.value;
      throwIfAborted(opts.signal);
      if (encodeError) throw encodeError;

      // Repeated frames are pixel-identical to the previous one, so the
      // canvas already holds the right image — skip decode and redraw.
      if (!frame.repeatsPrevious) {
        paint(await decodeSvg(frame.svg));
      }
      submit(frame.index);
      opts.onProgress?.(frame.index + 1, plan.frameCount);

      // The encoder queue is the backpressure signal. Without this a long
      // animation queues every frame at once and the tab balloons.
      if (encoder.encodeQueueSize > 8) {
        await encoder.flush();
      }
    }

    await encoder.flush();
    if (encodeError) throw encodeError;
    muxer.finalize();
  } finally {
    if (encoder.state !== 'closed') encoder.close();
  }

  return {
    blob: new Blob([target.buffer], { type: 'video/mp4' }),
    width,
    height,
    frameCount: plan.frameCount,
    durationMs: plan.durationMs,
  };
};

/**
 * Render frames to an MP4 blob using the same styling as the animated SVG.
 */
export const encodeFramesToMp4 = async (
  input: EncodeVideoOptions,
): Promise<EncodedVideo> => {
  if (!isVideoExportSupported()) {
    throw new Error(
      'MP4 export needs WebCodecs — available in Chrome, Edge, Brave and Arc.',
    );
  }
  const theme = resolveTheme(input.options.theme, input.customThemes ?? []);
  // Undefined on purpose — see DEFAULT_VIDEO_FPS. The tier picks the rate
  // unless the caller explicitly asked for one.
  const fps = input.fps;

  // Supersampling can outgrow the encoder. A 1400x800 terminal at 3x is
  // 4200x2400, which Chromium's AVC encoder refuses outright at every
  // profile/level — so rather than failing the export, step the scale down
  // until it fits. Descending, deduped, always ending at 1x.
  const requested = VIDEO_QUALITY[input.quality ?? 'medium']?.scale ?? 1;
  const candidates = [...new Set([requested, 2, 1])]
    .filter((s) => s >= 1 && s <= requested)
    .sort((a, b) => b - a);

  let lastPlan: VideoPlan | null = null;
  for (const scale of candidates) {
    const plan = buildVideoPlan(input.frames, input.options, theme, {
      fps,
      loops: input.loops,
      quality: input.quality,
      scale,
    });
    lastPlan = plan;
    const codec = await pickAvcCodec(
      plan.width,
      plan.height,
      plan.fps,
      bitrateFor(plan, plan.width, plan.height),
    );
    if (codec) {
      return encodePlan(plan, codec, {
        onProgress: input.onProgress,
        signal: input.signal,
      });
    }
  }

  throw new Error(
    `This browser's video encoder can't handle a ${lastPlan?.width}x${lastPlan?.height} ` +
      'frame. Try a smaller terminal size, or a lower quality setting.',
  );
};
