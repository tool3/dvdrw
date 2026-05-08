import {
  type ChangeEvent,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { ColorPicker } from './ColorPicker';
import styles from './Form.module.scss';

/* -------------------------------------------------------------------------- */
/*                                    Field                                   */
/* -------------------------------------------------------------------------- */

interface FieldProps {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
  layout?: 'stack' | 'inline';
}

export const Field = ({ label, hint, htmlFor, children, layout = 'stack' }: FieldProps) => (
  <div className={[styles.field, styles[`layout_${layout}`]].join(' ')}>
    <label className={styles.label} htmlFor={htmlFor}>
      {label}
    </label>
    <div className={styles.control}>{children}</div>
    {hint && <p className={styles.hint}>{hint}</p>}
  </div>
);

/* -------------------------------------------------------------------------- */
/*                                   Select                                   */
/* -------------------------------------------------------------------------- */

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: Array<{ label: string; value: string }>;
}

export const Select = ({ options, className, ...rest }: SelectProps) => (
  <div className={[styles.selectWrap, className ?? ''].filter(Boolean).join(' ')}>
    <select {...rest} className={styles.select}>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
    <svg
      className={styles.selectChevron}
      width="10"
      height="10"
      viewBox="0 0 10 10"
      aria-hidden
    >
      <path d="M2 4l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </div>
);

/* -------------------------------------------------------------------------- */
/*                                NumberInput                                 */
/* -------------------------------------------------------------------------- */

interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  /** Required: slider needs a finite range. */
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  /** Custom value formatter (defaults to `${value}${suffix}`). */
  formatValue?: (value: number) => string;
}

/**
 * Slider-style numeric input. Ditched the bare `<input type="number">` so
 * touch users get a proper draggable affordance. Native range input still
 * does the heavy lifting (keyboard arrows, accessibility) — we just paint
 * over it. Hit-target is 28px tall so it's comfortable on phones.
 */
export const NumberInput = ({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  formatValue,
}: NumberInputProps) => {
  const handle = (e: ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    if (!Number.isFinite(v)) return;
    onChange(v);
  };

  // Clamp the percentage so a value briefly out-of-range (e.g. while the
  // store is settling after a preset apply) doesn't push the fill past
  // the track edges.
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));

  // Default formatter: tabular numerals, optional suffix, drop trailing
  // zero noise on fractional steps so the readout stays compact.
  const display =
    formatValue?.(value) ??
    (Number.isInteger(value)
      ? `${value}${suffix ?? ''}`
      : `${value.toFixed(2).replace(/\.?0+$/, '')}${suffix ?? ''}`);

  return (
    <div className={styles.sliderWrap}>
      <div className={styles.sliderTrack}>
        <div className={styles.sliderFill} style={{ width: `${pct}%` }} />
        <input
          type="range"
          className={styles.sliderInput}
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={handle}
        />
      </div>
      <span className={styles.sliderValue}>{display}</span>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*                                  TextInput                                 */
/* -------------------------------------------------------------------------- */

interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'search';
}

export const TextInput = ({ value, onChange, placeholder, type = 'text' }: TextInputProps) => (
  <input
    type={type}
    className={styles.textInput}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
  />
);

/* -------------------------------------------------------------------------- */
/*                                ColorInput                                  */
/* -------------------------------------------------------------------------- */

interface ColorInputProps {
  value: string;
  onChange: (value: string) => void;
  allowEmpty?: boolean;
}

export const ColorInput = ({ value, onChange, allowEmpty }: ColorInputProps) => {
  const safe = value || '#000000';
  return (
    <div className={styles.colorWrap}>
      <ColorPicker value={safe} onChange={onChange} size={34} />
      <input
        type="text"
        className={styles.colorText}
        value={value}
        placeholder={allowEmpty ? 'inherit' : '#000000'}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*                                   Switch                                   */
/* -------------------------------------------------------------------------- */

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel?: string;
}

export const Switch = ({ checked, onChange, ariaLabel }: SwitchProps) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    onClick={() => onChange(!checked)}
    className={[styles.switch, checked ? styles.switchOn : ''].filter(Boolean).join(' ')}
  >
    <span className={styles.switchThumb} />
  </button>
);

/* -------------------------------------------------------------------------- */
/*                              SegmentedControl                              */
/* -------------------------------------------------------------------------- */

interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ label: string; value: T }>;
  /** "sm" (default) for in-popover use; "md" matches the OptionsMenu pill
   *  height so it can sit alongside it in the top bar. */
  size?: 'sm' | 'md';
}

export const SegmentedControl = <T extends string>({
  value,
  onChange,
  options,
  size = 'sm',
}: SegmentedControlProps<T>) => (
  <div
    className={[styles.segmented, styles[`segmented_${size}`]].join(' ')}
    role="tablist"
  >
    {options.map((opt) => (
      <button
        key={opt.value}
        role="tab"
        aria-selected={value === opt.value}
        className={[
          styles.segment,
          styles[`segment_${size}`],
          value === opt.value ? styles.segmentActive : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={() => onChange(opt.value)}
        type="button"
      >
        {opt.label}
      </button>
    ))}
  </div>
);
