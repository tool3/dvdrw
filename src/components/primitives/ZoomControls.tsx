import styles from './ZoomControls.module.scss';

const ZoomInIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
    <path d="M6 3v6M3 6h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const ZoomOutIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
    <path d="M3 6h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

/* Discrete zoom stops users can click through. Spans 0.25x → 4x with 100%
   in the middle so the reset button has a natural target. Exported so
   callers can clamp / display the bounds if they need to. */
export const ZOOM_STOPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

const nearestZoomStep = (current: number, direction: 1 | -1): number => {
  if (direction > 0) {
    const next = ZOOM_STOPS.find((s) => s > current + 0.001);
    return next ?? ZOOM_STOPS[ZOOM_STOPS.length - 1];
  }
  const lower = [...ZOOM_STOPS].reverse().find((s) => s < current - 0.001);
  return lower ?? ZOOM_STOPS[0];
};

interface ZoomControlsProps {
  zoom: number;
  onChange: (zoom: number) => void;
  /** When true, all three buttons are disabled (e.g. no preview to zoom). */
  disabled?: boolean;
}

/**
 * Compact glass capsule for zoom: [−] [125%] [+].
 *
 * The middle button doubles as the current-zoom readout AND a "reset to
 * 100%" affordance, so two of three buttons do double duty. Discrete
 * stops make clicks step predictably; uncontrolled internal state isn't
 * exposed because callers usually want to apply the value to a styled
 * element themselves (e.g. via the CSS `zoom` property).
 */
export const ZoomControls = ({ zoom, onChange, disabled }: ZoomControlsProps) => {
  const atMin = zoom <= ZOOM_STOPS[0];
  const atMax = zoom >= ZOOM_STOPS[ZOOM_STOPS.length - 1];

  return (
    <div className={styles.group} role="group" aria-label="Preview zoom">
      <button
        type="button"
        className={styles.btn}
        disabled={disabled || atMin}
        onClick={() => onChange(nearestZoomStep(zoom, -1))}
        aria-label="Zoom out"
        title="Zoom out"
      >
        <ZoomOutIcon />
      </button>
      <button
        type="button"
        className={styles.level}
        disabled={disabled}
        onClick={() => onChange(1)}
        aria-label={`Reset zoom to 100% (currently ${Math.round(zoom * 100)}%)`}
        title="Reset to 100%"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        className={styles.btn}
        disabled={disabled || atMax}
        onClick={() => onChange(nearestZoomStep(zoom, 1))}
        aria-label="Zoom in"
        title="Zoom in"
      >
        <ZoomInIcon />
      </button>
    </div>
  );
};
