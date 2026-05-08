import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Button } from '../primitives/Button';
import { useAppStore } from '../../stores/appStore';
import { useOptionsStore } from '../../stores/optionsStore';
import { optionsSections, type OptionsSection } from './sections';
import styles from './OptionsMenu.module.scss';

const ResetIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
    <path
      d="M2 6a4 4 0 1 0 1.2-2.85M2 2v2.5h2.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const PresetsIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
    <rect x="1" y="1" width="4.4" height="4.4" rx="1.1" fill="currentColor" />
    <rect x="6.6" y="1" width="4.4" height="4.4" rx="1.1" fill="currentColor" opacity="0.55" />
    <rect x="1" y="6.6" width="4.4" height="4.4" rx="1.1" fill="currentColor" opacity="0.55" />
    <rect x="6.6" y="6.6" width="4.4" height="4.4" rx="1.1" fill="currentColor" opacity="0.3" />
  </svg>
);

/**
 * The pill menu of customization categories.
 *
 * Renders a horizontal capsule with one button per category. Clicking a
 * button opens a popover anchored under that button containing the
 * section's controls; clicking the active button again, clicking outside,
 * or pressing Esc closes it. Only one popover is open at a time.
 *
 * Anchor position is computed via getBoundingClientRect() and applied to
 * a fixed-position popover so the cards beneath the menu can scroll
 * without dragging the popover with them.
 */
export const OptionsMenu = () => {
  const presetsOpen = useAppStore((s) => s.presetsOpen);
  const togglePresets = useAppStore((s) => s.togglePresets);
  const resetOptions = useOptionsStore((s) => s.reset);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(
    null,
  );

  const buttonsRef = useRef<Record<string, HTMLButtonElement | null>>({});
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const pillRef = useRef<HTMLDivElement | null>(null);

  // Close the popover whenever the presets gallery opens — stacking two
  // overlays would feel cluttered.
  useEffect(() => {
    if (presetsOpen) setActiveId(null);
  }, [presetsOpen]);

  const close = useCallback(() => setActiveId(null), []);

  const positionFor = useCallback((id: string) => {
    const btn = buttonsRef.current[id];
    if (!btn) return null;
    const rect = btn.getBoundingClientRect();
    return { left: rect.left + rect.width / 2, top: rect.bottom + 10 };
  }, []);

  const open = useCallback(
    (id: string) => {
      const pos = positionFor(id);
      if (!pos) return;
      setAnchor(pos);
      setActiveId(id);
    },
    [positionFor],
  );

  // Reposition while open in case layout shifts (responsive resizes, the
  // user scrolls the page, etc.).
  useLayoutEffect(() => {
    if (!activeId) return;
    const onUpdate = () => {
      const pos = positionFor(activeId);
      if (pos) setAnchor(pos);
    };
    window.addEventListener('resize', onUpdate);
    window.addEventListener('scroll', onUpdate, true);
    return () => {
      window.removeEventListener('resize', onUpdate);
      window.removeEventListener('scroll', onUpdate, true);
    };
  }, [activeId, positionFor]);

  // Click-outside + Esc dismissal.
  useEffect(() => {
    if (!activeId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (pillRef.current?.contains(target)) return;
      close();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [activeId, close]);

  const activeSection: OptionsSection | undefined = optionsSections.find(
    (s) => s.id === activeId,
  );

  return (
    <>
      <div className={styles.shell}>
        <div className={styles.pill} ref={pillRef}>
          {optionsSections.map((section) => (
            <button
              key={section.id}
              ref={(el) => {
                buttonsRef.current[section.id] = el;
              }}
              type="button"
              className={[
                styles.tab,
                activeId === section.id ? styles.tabActive : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-expanded={activeId === section.id}
              onClick={() => {
                if (activeId === section.id) close();
                else open(section.id);
              }}
            >
              {section.label}
            </button>
          ))}

          <span className={styles.divider} aria-hidden />

          <Button
            size="sm"
            variant="ghost"
            iconLeft={<PresetsIcon />}
            onClick={togglePresets}
            aria-expanded={presetsOpen}
            title="Open the preset gallery"
          >
            Presets
          </Button>

          <Button
            size="sm"
            variant="ghost"
            iconLeft={<ResetIcon />}
            onClick={resetOptions}
            title="Reset all customization options to defaults"
          >
            Reset
          </Button>
        </div>
      </div>

      {activeSection && anchor && (
        <div
          ref={popoverRef}
          className={styles.popover}
          style={{ left: anchor.left, top: anchor.top }}
          role="dialog"
          aria-label={`${activeSection.label} options`}
        >
          <div className={styles.popoverArrow} aria-hidden />
          <header className={styles.popoverHeader}>
            <span className={styles.popoverEyebrow}>Customize</span>
            <h3 className={styles.popoverTitle}>{activeSection.label}</h3>
          </header>
          <div className={styles.popoverBody}>{activeSection.body}</div>
        </div>
      )}
    </>
  );
};
