import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.scss';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
  /** On narrow viewports (≤720px) hide the text label and shrink padding so
   *  the button reads as an icon. The full label still goes to the
   *  accessibility tree via aria-label so screen readers / tooltips work. */
  mobileIconOnly?: boolean;
}

export const Button = ({
  variant = 'secondary',
  size = 'md',
  iconLeft,
  iconRight,
  fullWidth,
  mobileIconOnly,
  className,
  children,
  ...rest
}: ButtonProps) => (
  <button
    {...rest}
    className={[
      styles.button,
      styles[`variant_${variant}`],
      styles[`size_${size}`],
      fullWidth ? styles.fullWidth : '',
      mobileIconOnly ? styles.mobileIconOnly : '',
      className ?? '',
    ]
      .filter(Boolean)
      .join(' ')}
  >
    {iconLeft && <span className={styles.icon}>{iconLeft}</span>}
    {children && <span className={styles.label}>{children}</span>}
    {iconRight && <span className={styles.icon}>{iconRight}</span>}
  </button>
);
