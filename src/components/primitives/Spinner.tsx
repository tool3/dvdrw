import styles from './Spinner.module.scss';

interface SpinnerProps {
  /** Pixel size of the spinner. Defaults to 16 (inline) — pass larger sizes
   *  for stage / placeholder use. */
  size?: number;
  /** Inherit color is the default — set the parent's `color` to tint it.
   *  Use `tone="accent"` for the violet brand variant directly. */
  tone?: 'inherit' | 'accent' | 'muted';
  className?: string;
}

/**
 * Tiny ring spinner. One SVG, animated via CSS rotation. Used wherever
 * the UI shows an in-flight state (cast rendering, runner boot, etc.) so
 * the visual vocabulary stays consistent across the app.
 */
export const Spinner = ({ size = 16, tone = 'inherit', className }: SpinnerProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    className={[
      styles.spinner,
      styles[`tone_${tone}`],
      className ?? '',
    ]
      .filter(Boolean)
      .join(' ')}
    role="status"
    aria-label="Loading"
  >
    <circle
      cx="16"
      cy="16"
      r="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeDasharray="44 36"
      opacity="0.85"
    />
  </svg>
);
