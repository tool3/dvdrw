import type { ReactNode } from 'react';
import styles from './Shell.module.scss';
import { TopBar } from './TopBar';

interface ShellProps {
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
}

export const Shell = ({ left, center, right }: ShellProps) => (
  <div className={styles.shell}>
    <TopBar />
    <main className={styles.main}>
      <aside className={[styles.pane, styles.left].join(' ')}>{left}</aside>
      <section className={[styles.pane, styles.center].join(' ')}>{center}</section>
      <aside className={[styles.pane, styles.right].join(' ')}>{right}</aside>
    </main>
  </div>
);
