import { useEffect } from 'react';
import { useAppStore } from '../../stores/appStore';
import { useOptionsStore } from '../../stores/optionsStore';
import { PRESETS, type Preset } from '../../lib/presets';
import styles from './PresetGallery.module.scss';

const PresetCard = ({ preset, onApply }: { preset: Preset; onApply: () => void }) => {
  const { from, to } = preset.swatch;
  return (
    <button type="button" className={styles.card} onClick={onApply}>
      <span
        className={styles.swatch}
        style={{
          background: `linear-gradient(135deg, ${from}, ${to})`,
        }}
      >
        <span className={styles.swatchInner} />
      </span>
      <span className={styles.cardBody}>
        <span className={styles.cardName}>{preset.name}</span>
        <span className={styles.cardDesc}>{preset.description}</span>
      </span>
    </button>
  );
};

export const PresetGallery = () => {
  const open = useAppStore((s) => s.presetsOpen);
  const setOpen = useAppStore((s) => s.setPresetsOpen);
  const apply = useOptionsStore((s) => s.applyPartial);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  return (
    <div
      className={[styles.overlay, open ? styles.overlayOpen : ''].filter(Boolean).join(' ')}
      onClick={() => setOpen(false)}
      aria-hidden={!open}
    >
      <aside
        className={[styles.drawer, open ? styles.drawerOpen : ''].filter(Boolean).join(' ')}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Presets"
      >
        <header className={styles.header}>
          <div>
            <h2 className={styles.title}>Presets</h2>
            <p className={styles.sub}>One-click looks. Click to apply.</p>
          </div>
          <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
              <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className={styles.grid}>
          {PRESETS.map((p) => (
            <PresetCard
              key={p.id}
              preset={p}
              onApply={() => {
                apply(p.patch);
                setOpen(false);
              }}
            />
          ))}
        </div>
      </aside>
    </div>
  );
};
