import { useAppStore } from '../../stores/appStore';
import { Button } from '../primitives/Button';
import { SegmentedControl } from '../primitives/Form';
import { OptionsMenu } from '../options/OptionsMenu';
import styles from './TopBar.module.scss';

const ThemeIcon = ({ theme }: { theme: 'dark' | 'light' }) => {
  if (theme === 'dark') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
        <circle cx="8" cy="8" r="3" fill="currentColor" />
        <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
          <line x1="8" y1="1.5" x2="8" y2="3" />
          <line x1="8" y1="13" x2="8" y2="14.5" />
          <line x1="1.5" y1="8" x2="3" y2="8" />
          <line x1="13" y1="8" x2="14.5" y2="8" />
          <line x1="3.2" y1="3.2" x2="4.3" y2="4.3" />
          <line x1="11.7" y1="11.7" x2="12.8" y2="12.8" />
          <line x1="3.2" y1="12.8" x2="4.3" y2="11.7" />
          <line x1="11.7" y1="4.3" x2="12.8" y2="3.2" />
        </g>
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <path
        d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5z"
        fill="currentColor"
      />
    </svg>
  );
};

/**
 * Brand mark — a stylized aperture/lens silhouette, hinting at the
 * "captured terminal frame" nature of the product. Built as concentric
 * shapes so it scales crisply at any size and inherits currentColor.
 */
const Mark = () => (
  <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
    <defs>
      <linearGradient id="dvdrw-brand-stroke" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="currentColor" stopOpacity="0.95" />
        <stop offset="100%" stopColor="currentColor" stopOpacity="0.5" />
      </linearGradient>
    </defs>
    <rect
      x="2"
      y="2"
      width="18"
      height="18"
      rx="6"
      fill="none"
      stroke="url(#dvdrw-brand-stroke)"
      strokeWidth="1.6"
    />
    <circle cx="11" cy="11" r="3.2" fill="currentColor" opacity="0.95" />
    <circle cx="11" cy="11" r="6.4" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.4" />
  </svg>
);

export const TopBar = () => {
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);

  return (
    <header className={styles.bar}>
      <div className={styles.brand}>
        <span className={styles.brandMark}>
          <Mark />
        </span>
        <span className={styles.brandWord}>
          <span className={styles.brandName}>dvdrw</span>
          <span className={styles.brandTag}>animated terminal SVGs</span>
        </span>
      </div>

      <div className={styles.center}>
        <SegmentedControl
          value={view}
          onChange={setView}
          options={[
            { label: 'Script', value: 'script' },
            { label: 'Cast', value: 'cast' },
          ]}
        />
        <OptionsMenu />
      </div>

      <div className={styles.right}>
        <Button
          variant="ghost"
          size="sm"
          iconLeft={<ThemeIcon theme={theme} />}
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        />
      </div>
    </header>
  );
};
