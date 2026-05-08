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
}

export const Button = ({
  variant = 'secondary',
  size = 'md',
  iconLeft,
  iconRight,
  fullWidth,
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
