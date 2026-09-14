import { useEffect, useRef, useState } from 'react';
import styles from './ExamplePicker.module.scss';

export interface ExampleItem {
  id: string;
  label: string;
  description?: string;
}

interface ExamplePickerProps {
  items: readonly ExampleItem[];
  onPick: (id: string) => void;
  /** Trigger text. The single-item form appends the item's label. */
  label?: string;
  title?: string;
}

const ChevronIcon = () => (
  <svg width="8" height="8" viewBox="0 0 10 10" aria-hidden>
    <path
      d="M2 3.5L5 6.5l3-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * Menu of ready-made examples.
 *
 * With a single example there is nothing to choose between, so it renders
 * as a plain button that applies it on one click; a second entry turns it
 * into a dropdown with no other change at the call site.
 */
export const ExamplePicker = ({
  items,
  onPick,
  label = 'Examples',
  title,
}: ExamplePickerProps) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (items.length === 0) return null;

  if (items.length === 1) {
    const only = items[0];
    return (
      <button
        type="button"
        className={styles.trigger}
        onClick={() => onPick(only.id)}
        title={title ?? only.description ?? only.label}
      >
        {label} · {only.label}
      </button>
    );
  }

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={title}
      >
        {label}
        <ChevronIcon />
      </button>

      {open && (
        <ul className={styles.menu} role="menu">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                role="menuitem"
                className={styles.item}
                onClick={() => {
                  onPick(item.id);
                  setOpen(false);
                }}
              >
                <span className={styles.itemLabel}>{item.label}</span>
                {item.description && (
                  <span className={styles.itemDesc}>{item.description}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
