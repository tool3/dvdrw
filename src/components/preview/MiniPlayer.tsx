import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import styles from './MiniPlayer.module.scss';

interface MiniPlayerProps {
  /** Raw SVG markup. Will be injected as a live SVG element so we can
   *  drive its SMIL timeline — passing this through `<img src=data:>`
   *  wouldn't let us scrub / pause. */
  svg: string;
  /** Total animation duration in ms. Used as the scrubber range AND to
   *  modulo the SVG's current time when the underlying animation loops
   *  indefinitely (which it does whenever `options.loop` is true). */
  durationMs: number;
  /** Optional zoom multiplier applied via CSS `zoom`. Passed through so
   *  the existing zoom controls in SvgPreview / Runner keep working. */
  zoom?: number;
  /** Surface-side alt text for the visual stage. */
  alt?: string;
}

const PlayIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
    <path d="M4 2.5L11 7L4 11.5Z" fill="currentColor" />
  </svg>
);

const PauseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
    <rect x="3" y="2.5" width="2.5" height="9" rx="0.5" fill="currentColor" />
    <rect x="8.5" y="2.5" width="2.5" height="9" rx="0.5" fill="currentColor" />
  </svg>
);

const RestartIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
    <path
      d="M3 7a4 4 0 1 0 1.2-2.85M3 3v2.5h2.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const formatTime = (ms: number): string => {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
};

/**
 * YouTube-style mini player for animated terminal SVGs.
 *
 * Drives the SVG's native SMIL timeline:
 *   - `pauseAnimations()` / `unpauseAnimations()` for play/pause
 *   - `setCurrentTime(seconds)` for scrubbing
 *   - `getCurrentTime()` polled per animation frame for progress
 *
 * Looping SVGs report a monotonically increasing time; we modulo by
 * `durationMs` so the scrubber tracks position within the current loop
 * iteration instead of pegging to 100%.
 */
export const MiniPlayer = ({
  svg,
  durationMs,
  zoom = 1,
  alt = 'rendered preview',
}: MiniPlayerProps) => {
  const stageRef = useRef<HTMLDivElement | null>(null);
  // Set to true after the user scrubs to the end of a non-looping
  // animation, so the play button becomes a "restart" affordance.
  const [paused, setPaused] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  // While the user is dragging the scrubber we suspend the rAF-driven
  // progress updates so the thumb doesn't jitter against the live time.
  const draggingRef = useRef(false);

  const safeDuration = Math.max(1, durationMs);

  // Mount / replace the inline SVG. Resetting paused + currentMs here
  // mirrors a video tag reseeking when its `src` changes.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.innerHTML = svg;
    setCurrentMs(0);
    setPaused(false);
  }, [svg]);

  const getSvgEl = useCallback((): SVGSVGElement | null => {
    return stageRef.current?.querySelector('svg') ?? null;
  }, []);

  // Per-frame poll of the SVG's time. rAF keeps it cheap and aligned to
  // paint, so the scrubber moves smoothly without burning CPU.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (draggingRef.current) return;
      const el = getSvgEl();
      if (!el || typeof el.getCurrentTime !== 'function') return;
      const t = el.getCurrentTime() * 1000;
      // For looping SVGs (the common case) we want progress *within*
      // the current cycle, not the ever-growing total elapsed.
      setCurrentMs(t % safeDuration);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [getSvgEl, safeDuration]);

  const togglePlay = useCallback(() => {
    const el = getSvgEl();
    if (!el) return;
    if (paused) {
      el.unpauseAnimations();
      setPaused(false);
    } else {
      el.pauseAnimations();
      setPaused(true);
    }
  }, [getSvgEl, paused]);

  const restart = useCallback(() => {
    const el = getSvgEl();
    if (!el) return;
    el.setCurrentTime(0);
    el.unpauseAnimations();
    setPaused(false);
    setCurrentMs(0);
  }, [getSvgEl]);

  const seek = useCallback(
    (ms: number) => {
      const el = getSvgEl();
      if (!el) return;
      el.setCurrentTime(ms / 1000);
      setCurrentMs(ms);
    },
    [getSvgEl],
  );

  const progressPct = useMemo(
    () => Math.max(0, Math.min(100, (currentMs / safeDuration) * 100)),
    [currentMs, safeDuration],
  );

  const stageStyle: CSSProperties | undefined =
    zoom !== 1 ? { zoom } : undefined;

  return (
    <div className={styles.wrap}>
      <div ref={stageRef} className={styles.stage} style={stageStyle} aria-label={alt} />

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.playBtn}
          onClick={togglePlay}
          aria-label={paused ? 'Play' : 'Pause'}
          title={paused ? 'Play (space)' : 'Pause (space)'}
        >
          {paused ? <PlayIcon /> : <PauseIcon />}
        </button>

        <div
          className={styles.scrubTrack}
          // The filled portion's width is driven by `--progress` so the
          // browser layouts the SVG once and just repaints the bar.
          style={{ '--progress': `${progressPct}%` } as CSSProperties}
        >
          <input
            type="range"
            className={styles.scrubInput}
            min={0}
            max={safeDuration}
            step={1}
            value={Math.round(currentMs)}
            onPointerDown={() => {
              draggingRef.current = true;
            }}
            onPointerUp={() => {
              draggingRef.current = false;
            }}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label="Seek"
          />
        </div>

        <span className={styles.timecode}>
          {formatTime(currentMs)} <span className={styles.sep}>/</span>{' '}
          {formatTime(safeDuration)}
        </span>

        <button
          type="button"
          className={styles.iconBtn}
          onClick={restart}
          aria-label="Restart"
          title="Restart"
        >
          <RestartIcon />
        </button>
      </div>
    </div>
  );
};
