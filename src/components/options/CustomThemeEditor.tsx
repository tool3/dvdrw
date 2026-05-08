import { useState } from 'react';
import { useOptionsStore } from '../../stores/optionsStore';
import {
  newCustomThemeId,
  useCustomThemesStore,
  type CustomTheme,
} from '../../stores/customThemesStore';
import { Button } from '../primitives/Button';
import { ColorPicker } from '../primitives/ColorPicker';
import { TextInput } from '../primitives/Form';
import styles from './CustomThemeEditor.module.scss';

interface CustomThemeEditorProps {
  /** When provided, editor is in "edit" mode; otherwise "create". */
  theme: CustomTheme | null;
  /**
   * Pre-fill colors for create mode (e.g. when promoting an inline
   * `Set Theme {json}` directive into a saved theme). Ignored when `theme`
   * is provided. Missing fields fall back to DEFAULT_FORM.
   */
  initialColors?: Partial<Omit<CustomTheme, 'id'>>;
  onClose: () => void;
}

const DEFAULT_FORM: Omit<CustomTheme, 'id'> = {
  name: 'My theme',
  background: '#1e1e1e',
  foreground: '#d4d4d4',
  cursor: '#ffffff',
  selection: '#264f78',
  black: '#000000',
  red: '#cd3131',
  green: '#0dbc79',
  yellow: '#e5e510',
  blue: '#2472c8',
  magenta: '#bc3fbc',
  cyan: '#11a8cd',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#f14c4c',
  brightGreen: '#23d18b',
  brightYellow: '#f5f543',
  brightBlue: '#3b8eea',
  brightMagenta: '#d670d6',
  brightCyan: '#29b8db',
  brightWhite: '#ffffff',
};

const COLOR_GROUPS: {
  label: string;
  colors: { key: keyof Omit<CustomTheme, 'id' | 'name'>; label: string }[];
}[] = [
  {
    label: 'Base',
    colors: [
      { key: 'background', label: 'Background' },
      { key: 'foreground', label: 'Foreground' },
      { key: 'cursor', label: 'Cursor' },
      { key: 'selection', label: 'Selection' },
    ],
  },
  {
    label: 'Normal',
    colors: [
      { key: 'black', label: 'Black' },
      { key: 'red', label: 'Red' },
      { key: 'green', label: 'Green' },
      { key: 'yellow', label: 'Yellow' },
      { key: 'blue', label: 'Blue' },
      { key: 'magenta', label: 'Magenta' },
      { key: 'cyan', label: 'Cyan' },
      { key: 'white', label: 'White' },
    ],
  },
  {
    label: 'Bright',
    colors: [
      { key: 'brightBlack', label: 'Black' },
      { key: 'brightRed', label: 'Red' },
      { key: 'brightGreen', label: 'Green' },
      { key: 'brightYellow', label: 'Yellow' },
      { key: 'brightBlue', label: 'Blue' },
      { key: 'brightMagenta', label: 'Magenta' },
      { key: 'brightCyan', label: 'Cyan' },
      { key: 'brightWhite', label: 'White' },
    ],
  },
];

export const CustomThemeEditor = ({
  theme,
  initialColors,
  onClose,
}: CustomThemeEditorProps) => {
  const addTheme = useCustomThemesStore((s) => s.addTheme);
  const updateTheme = useCustomThemesStore((s) => s.updateTheme);
  const setOption = useOptionsStore((s) => s.set);

  const [form, setForm] = useState<Omit<CustomTheme, 'id'>>(() => {
    if (theme) {
      const { id, ...rest } = theme;
      void id;
      return rest;
    }
    if (initialColors) {
      // Merge over defaults so any missing fields stay valid color strings.
      return { ...DEFAULT_FORM, ...initialColors };
    }
    return DEFAULT_FORM;
  });

  const update = <K extends keyof Omit<CustomTheme, 'id'>>(
    key: K,
    value: Omit<CustomTheme, 'id'>[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const save = () => {
    if (theme) {
      updateTheme(theme.id, form);
      // Re-trigger the option subscriber so the syncing helper rewrites
      // the inline `Set Theme {json}` directive in the script with the
      // freshly edited colors. Touching the same id with applyPartial
      // wouldn't fire because Object.is would be true; toggle and back.
      setOption('theme', '__pending__' as unknown as string);
      setOption('theme', theme.id);
    } else {
      const created: CustomTheme = { ...form, id: newCustomThemeId() };
      addTheme(created);
      setOption('theme', created.id);
    }
    onClose();
  };

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.back}
          onClick={onClose}
          aria-label="Back to theme picker"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
            <path
              d="M9 2L4 7L9 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>{theme ? 'Edit theme' : 'New theme'}</span>
        </button>
      </header>

      <div className={styles.scroll}>
        <TextInput
          value={form.name}
          onChange={(v) => update('name', v)}
          placeholder="Theme name"
        />

        {/* Live preview — uses the form colors so edits land instantly. */}
        <div
          className={styles.preview}
          style={{ background: form.background, color: form.foreground }}
        >
          <div className={styles.previewLine}>
            <span style={{ color: form.green }}>$</span>{' '}
            <span style={{ color: form.foreground }}>echo</span>{' '}
            <span style={{ color: form.yellow }}>"hello"</span>
          </div>
          <div className={styles.previewLine} style={{ color: form.cyan }}>
            hello
          </div>
          <div className={styles.previewLine}>
            <span style={{ color: form.magenta }}>~/projects</span>{' '}
            <span style={{ color: form.blue }}>main</span>{' '}
            <span style={{ color: form.red }}>!</span>
          </div>
        </div>

        {COLOR_GROUPS.map((group) => (
          <div key={group.label} className={styles.group}>
            <h5 className={styles.groupTitle}>{group.label}</h5>
            <div className={styles.colorGrid}>
              {group.colors.map((c) => (
                <div key={c.key} className={styles.colorRow}>
                  <ColorPicker
                    value={form[c.key]}
                    onChange={(v) => update(c.key, v)}
                    size={22}
                    ariaLabel={`${group.label} ${c.label}`}
                  />
                  <span className={styles.colorLabel}>{c.label}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <footer className={styles.footer}>
        <Button variant="ghost" onClick={onClose} size="sm">
          Cancel
        </Button>
        <Button variant="primary" onClick={save} size="sm">
          {theme ? 'Save changes' : 'Create theme'}
        </Button>
      </footer>
    </div>
  );
};
