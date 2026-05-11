import { useMemo, useState } from 'react';
import { themes as builtinThemes } from 'dvdrw';
import { useOptionsStore } from '../../stores/optionsStore';
import {
  useCustomThemesStore,
  type CustomTheme,
} from '../../stores/customThemesStore';
import { Button } from '../primitives/Button';
import { CustomThemeEditor } from './CustomThemeEditor';
import styles from './ThemePicker.module.scss';

interface BuiltinThemeMeta {
  id: string;
  label: string;
  bg: string;
  fg: string;
  green: string;
  yellow: string;
  cyan: string;
}

/* ------------------------------------------------------------------ */
/*                          Theme classification                      */
/* ------------------------------------------------------------------ */

/** Cheap luminance from a `#rrggbb` background; used to bucket dark/light. */
const isLight = (hex: string): boolean => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  // Rec. 709 luma
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 160;
};

const titleCase = (s: string) =>
  s
    .replace(/([A-Z]+)/g, ' $1')
    .replace(/(\d+)/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();

const buildThemeMeta = (): { dark: BuiltinThemeMeta[]; light: BuiltinThemeMeta[] } => {
  const dark: BuiltinThemeMeta[] = [];
  const light: BuiltinThemeMeta[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const themes = builtinThemes as Record<string, any>;
  for (const id of Object.keys(themes).sort()) {
    const t = themes[id];
    const meta: BuiltinThemeMeta = {
      id,
      label: titleCase(id),
      bg: t.background,
      fg: t.foreground,
      green: t.green,
      yellow: t.yellow,
      cyan: t.cyan,
    };
    (isLight(t.background) ? light : dark).push(meta);
  }
  return { dark, light };
};

/* ------------------------------------------------------------------ */
/*                                Card                                */
/* ------------------------------------------------------------------ */

interface CardProps {
  bg: string;
  fg: string;
  green: string;
  yellow: string;
  cyan: string;
  label: string;
  selected: boolean;
  onClick: () => void;
  /** Slot for hover-revealed actions (edit / delete on custom themes). */
  actions?: React.ReactNode;
}

const ThemeCard = ({
  bg,
  fg,
  green,
  yellow,
  cyan,
  label,
  selected,
  onClick,
  actions,
}: CardProps) => (
  // Wrap so the action buttons sit alongside the card button, not nested
  // inside one. Nested <button>s are invalid HTML and trip React's
  // hydration warning.
  <div className={styles.cardWrap}>
    <button
      type="button"
      className={[styles.card, selected ? styles.cardSelected : '']
        .filter(Boolean)
        .join(' ')}
      onClick={onClick}
      aria-pressed={selected}
    >
      <span
        className={styles.preview}
        style={{ background: bg, color: fg }}
      >
        <span className={styles.previewLine}>
          <span style={{ color: green }}>$</span> echo{' '}
          <span style={{ color: yellow }}>"hi"</span>
        </span>
        <span className={styles.previewLine} style={{ color: cyan }}>
          hello world
        </span>
      </span>
      <span className={styles.label}>{label}</span>
    </button>
    {actions && <span className={styles.actionSlot}>{actions}</span>}
  </div>
);

/* ------------------------------------------------------------------ */
/*                              Picker                                */
/* ------------------------------------------------------------------ */

export const ThemePicker = () => {
  const themeId = useOptionsStore((s) => s.options.theme);
  const setOption = useOptionsStore((s) => s.set);

  const customThemes = useCustomThemesStore((s) => s.themes);
  const deleteCustomTheme = useCustomThemesStore((s) => s.deleteTheme);

  const { dark, light } = useMemo(() => buildThemeMeta(), []);
  const [editorState, setEditorState] = useState<
    { kind: 'create' } | { kind: 'edit'; theme: CustomTheme } | null
  >(null);

  if (editorState) {
    return (
      <CustomThemeEditor
        theme={editorState.kind === 'edit' ? editorState.theme : null}
        onClose={() => setEditorState(null)}
      />
    );
  }

  const select = (id: string) => setOption('theme', id);

  return (
    <div className={styles.wrap}>
      {customThemes.length > 0 && (
        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>Custom</h4>
          <div className={styles.grid}>
            {customThemes.map((t) => (
              <ThemeCard
                key={t.id}
                bg={t.background}
                fg={t.foreground}
                green={t.green}
                yellow={t.yellow}
                cyan={t.cyan}
                label={t.name}
                selected={themeId === t.id}
                onClick={() => select(t.id)}
                actions={
                  <>
                    <button
                      type="button"
                      className={styles.actionBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditorState({ kind: 'edit', theme: t });
                      }}
                      aria-label={`Edit ${t.name}`}
                      title="Edit"
                    >
                      <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden>
                        <path
                          d="M1 9.5L1.5 7.5L7.5 1.5L9 3L3 9L1 9.5Z"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.2"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className={styles.actionBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (themeId === t.id) {
                          // Avoid leaving the user pointing at a deleted id.
                          setOption('theme', 'dracula');
                        }
                        deleteCustomTheme(t.id);
                      }}
                      aria-label={`Delete ${t.name}`}
                      title="Delete"
                    >
                      <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden>
                        <path
                          d="M2 2L9 9M9 2L2 9"
                          stroke="currentColor"
                          strokeWidth="1.4"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                  </>
                }
              />
            ))}
          </div>
        </section>
      )}

      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>Dark</h4>
        <div className={styles.grid}>
          {dark.map((t) => (
            <ThemeCard
              key={t.id}
              bg={t.bg}
              fg={t.fg}
              green={t.green}
              yellow={t.yellow}
              cyan={t.cyan}
              label={t.label}
              selected={themeId === t.id}
              onClick={() => select(t.id)}
            />
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>Light</h4>
        <div className={styles.grid}>
          {light.map((t) => (
            <ThemeCard
              key={t.id}
              bg={t.bg}
              fg={t.fg}
              green={t.green}
              yellow={t.yellow}
              cyan={t.cyan}
              label={t.label}
              selected={themeId === t.id}
              onClick={() => select(t.id)}
            />
          ))}
        </div>
      </section>

      <Button
        variant="secondary"
        size="sm"
        fullWidth
        onClick={() => setEditorState({ kind: 'create' })}
        className={styles.customTheme}
        iconLeft={
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path
              d="M6 2v8M2 6h8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        }
      >
        Create custom theme
      </Button>
    </div>
  );
};
