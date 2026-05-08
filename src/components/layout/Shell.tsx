import type { ReactNode } from 'react';
import styles from './Shell.module.scss';
import { TopBar } from './TopBar';

interface ShellProps {
  /** Primary card on the left of the work area (editor / dropzone). */
  primary: ReactNode;
  /** Secondary card on the right of the work area (preview / runner). */
  secondary: ReactNode;
  /** Width ratio between primary and secondary cards. Default 40/60. */
  split?: '40-60' | '50-50' | '60-40';
}

/**
 * Top-level layout. Two vertical bands:
 *   1. TopBar — brand, Script/Cast switcher, OptionsMenu pill, theme toggle
 *      all on the same row.
 *   2. Work area — two cards side-by-side per the requested split.
 */
export const Shell = ({ primary, secondary, split = '40-60' }: ShellProps) => (
  <div className={styles.shell}>
    <TopBar />
    <main className={[styles.main, styles[`split_${split}`]].join(' ')}>
      <section className={[styles.pane, styles.primary].join(' ')}>
        {primary}
      </section>
      <section className={[styles.pane, styles.secondary].join(' ')}>
        {secondary}
      </section>
    </main>
  </div>
);
