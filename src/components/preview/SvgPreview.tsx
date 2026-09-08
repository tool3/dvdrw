import { useCallback, useMemo, useState } from 'react';
import type { RenderState } from '../../lib/types';
import styles from './SvgPreview.module.scss';
import { Button } from '../primitives/Button';
import { Spinner } from '../primitives/Spinner';
import { ZoomControls } from '../primitives/ZoomControls';
import { MiniPlayer } from './MiniPlayer';
import { framesForInput, type RenderInput } from '../../lib/render';
import {
  VIDEO_QUALITY_LABELS,
  encodeFramesToMp4,
  isVideoExportSupported,
} from '../../lib/video';
import { Select } from '../primitives/Form';
import { useAppStore } from '../../stores/appStore';
import { useCustomThemesStore } from '../../stores/customThemesStore';
import type { RenderOptions } from '../../stores/optionsStore';

interface SvgPreviewProps {
  state: RenderState;
  filename?: string;
  notices?: string[];
  /**
   * Enables MP4 export. The render itself happened in a worker, so the
   * frames aren't on this side — re-deriving them from the input on click
   * is cheaper than shipping every frame over `postMessage` on every
   * render just in case someone eventually exports.
   */
  video?: { input: RenderInput | null; options: RenderOptions } | null;
}

const DownloadIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
    <path
      d="M7 1V9M7 9L4 6M7 9L10 6M2 11.5H12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
    <rect x="4" y="4" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
    <path d="M2 10V3.5C2 2.67 2.67 2 3.5 2H10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

const formatBytes = (n: number) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
};

const FilmIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
    <rect x="2" y="3" width="10" height="8" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
    <path d="M5.5 3v8M8.5 3v8" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);

const saveBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const downloadBlob = (text: string, filename: string, mime: string) =>
  saveBlob(new Blob([text], { type: mime }), filename);

export const SvgPreview = ({
  state,
  filename = 'output.svg',
  notices,
  video,
}: SvgPreviewProps) => {
  const [zoom, setZoom] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [exportPct, setExportPct] = useState(0);
  const [exportError, setExportError] = useState<string | null>(null);
  const customThemes = useCustomThemesStore((s) => s.themes);
  const videoQuality = useAppStore((s) => s.videoQuality);
  const setVideoQuality = useAppStore((s) => s.setVideoQuality);

  const videoSupported = useMemo(() => isVideoExportSupported(), []);
  const canExportVideo =
    videoSupported && !!video?.input && state.status === 'ok';

  const exportMp4 = useCallback(async () => {
    if (!video?.input || exporting) return;
    setExporting(true);
    setExportPct(0);
    setExportError(null);
    try {
      const { frames } = framesForInput(video.input, video.options, customThemes);
      const { blob } = await encodeFramesToMp4({
        frames,
        options: video.options,
        customThemes,
        quality: videoQuality,
        onProgress: (done, total) =>
          setExportPct(total > 0 ? Math.round((done / total) * 100) : 0),
      });
      saveBlob(blob, filename.replace(/\.svg$/i, '') + '.mp4');
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
      setExportPct(0);
    }
  }, [video, exporting, filename, customThemes, videoQuality]);

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <div className={styles.meta}>
          {state.status === 'ok' && (
            <>
              <span>{state.result.width}×{state.result.height}</span>
              <span className={styles.dot} />
              <span>{state.result.frameCount} frames</span>
              <span className={styles.dot} />
              <span>{(state.result.durationMs / 1000).toFixed(2)}s</span>
              <span className={styles.dot} />
              <span>{formatBytes(new Blob([state.result.svg]).size)}</span>
            </>
          )}
          {state.status === 'rendering' && (
            <span className={styles.muted}>
              <Spinner size={12} tone="accent" className={styles.inlineSpinner} />
              Rendering…
            </span>
          )}
          {state.status === 'idle' && <span className={styles.muted}>Edit a script to render</span>}
          {state.status === 'error' && <span className={styles.errorText}>Render failed</span>}
          {exportError && (
            <span className={styles.errorText}>MP4 export failed: {exportError}</span>
          )}
        </div>

        <div className={styles.actions}>
          <ZoomControls
            zoom={zoom}
            onChange={setZoom}
            disabled={state.status !== 'ok'}
          />
          <Button
            size="sm"
            variant="ghost"
            iconLeft={<CopyIcon />}
            disabled={state.status !== 'ok'}
            onClick={() => {
              if (state.status !== 'ok') return;
              navigator.clipboard.writeText(state.result.svg).catch(() => {});
            }}
            aria-label="Copy SVG to clipboard"
            title="Copy SVG"
            mobileIconOnly
          >
            Copy
          </Button>
          <Button
            size="sm"
            variant="primary"
            iconLeft={<DownloadIcon />}
            disabled={state.status !== 'ok'}
            onClick={() => {
              if (state.status !== 'ok') return;
              downloadBlob(state.result.svg, filename, 'image/svg+xml');
            }}
            aria-label="Download SVG"
            title="Download SVG"
            mobileIconOnly
          >
            Download SVG
          </Button>
          {videoSupported && video && (
            <Select
              className={styles.qualitySelect}
              value={videoQuality}
              onChange={(e) =>
                setVideoQuality(e.target.value as typeof videoQuality)
              }
              disabled={exporting}
              aria-label="MP4 quality"
              title={
                VIDEO_QUALITY_LABELS.find((q) => q.value === videoQuality)?.hint
              }
              options={VIDEO_QUALITY_LABELS.map((q) => ({
                label: q.label,
                value: q.value,
              }))}
            />
          )}
          {videoSupported && video && (
            <Button
              size="sm"
              variant="secondary"
              // See Runner: the label is hidden on mobile, so the spinner in
              // the icon slot is the only in-flight signal there.
              iconLeft={exporting ? <Spinner size={14} /> : <FilmIcon />}
              disabled={!canExportVideo || exporting}
              onClick={exportMp4}
              aria-label={exporting ? 'Encoding MP4' : 'Download MP4'}
              title={
                exporting ? 'Encoding MP4…' : 'Encode the animation as an H.264 MP4'
              }
              mobileIconOnly
            >
              {exporting ? `Encoding ${exportPct}%` : 'Download MP4'}
            </Button>
          )}
        </div>
      </div>

      {state.status === 'ok' && (
        <MiniPlayer
          svg={state.result.svg}
          durationMs={state.result.durationMs}
          zoom={zoom}
        />
      )}
      {state.status !== 'ok' && (
        <div className={styles.stage}>
          {state.status === 'rendering' && (
            <div className={styles.stagePending} role="status" aria-live="polite">
              <Spinner size={36} tone="accent" />
              <span className={styles.stagePendingLabel}>Rendering…</span>
              <span className={styles.stagePendingSub}>
                Walking the cast frames and emitting the animated SVG.
              </span>
            </div>
          )}
          {state.status === 'idle' && <div className={styles.placeholder}>Your preview will appear here.</div>}
          {state.status === 'error' && (
            <div className={styles.error}>
              <strong>{state.error.message}</strong>
              {state.error.hint && <span className={styles.errorHint}>{state.error.hint}</span>}
            </div>
          )}
        </div>
      )}

      {notices && notices.length > 0 && (
        <div className={styles.notices}>
          <span className={styles.noticeTitle}>Skipped commands</span>
          <ul>
            {notices.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
