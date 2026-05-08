import type { HTMLAttributes, ReactNode } from 'react';
import styles from './Card.module.scss';

interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Optional eyebrow + title shown in a tight card header. */
  eyebrow?: ReactNode;
  title?: ReactNode;
  /** Action slot rendered on the right of the header (toolbar / segmented control). */
  actions?: ReactNode;
  /** Footer slot — renders below the body inside the same card surface. */
  footer?: ReactNode;
  /** Variant: solid card (default) or "embedded" so the card hugs its parent
   *  with the header but no outer padding. */
  variant?: 'card' | 'flat';
  children?: ReactNode;
}

/**
 * Glass card primitive. The dominant surface in the app — used for the
 * editor, preview, runner, dropzone, etc. Bakes in the directional
 * highlight + long shadow + backdrop blur so callers don't have to
 * re-derive it every time.
 */
export const Card = ({
  eyebrow,
  title,
  actions,
  footer,
  variant = 'card',
  className,
  children,
  ...rest
}: CardProps) => (
  <div
    {...rest}
    className={[styles.card, styles[`variant_${variant}`], className ?? '']
      .filter(Boolean)
      .join(' ')}
  >
    {(eyebrow || title || actions) && (
      <header className={styles.header}>
        <div className={styles.heading}>
          {eyebrow && <span className={styles.eyebrow}>{eyebrow}</span>}
          {title && <h2 className={styles.title}>{title}</h2>}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </header>
    )}
    <div className={styles.body}>{children}</div>
    {footer && <footer className={styles.footer}>{footer}</footer>}
  </div>
);
