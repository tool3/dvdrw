import { create } from 'zustand';

export type Theme = 'dark' | 'light';
export type View = 'script' | 'cast';
export type ScriptMode = 'preview' | 'run';

interface AppState {
  theme: Theme;
  view: View;
  scriptMode: ScriptMode;
  presetsOpen: boolean;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setView: (view: View) => void;
  setScriptMode: (mode: ScriptMode) => void;
  togglePresets: () => void;
  setPresetsOpen: (open: boolean) => void;
}

const readInitialTheme = (): Theme => {
  if (typeof document === 'undefined') return 'dark';
  const attr = document.documentElement.getAttribute('data-theme');
  return attr === 'light' ? 'light' : 'dark';
};

const persistTheme = (theme: Theme) => {
  try {
    localStorage.setItem('dvdrw.theme', theme);
  } catch {
    /* ignore */
  }
  document.documentElement.setAttribute('data-theme', theme);
};

export const useAppStore = create<AppState>((set, get) => ({
  theme: readInitialTheme(),
  view: 'script',
  scriptMode: 'preview',
  presetsOpen: false,
  setTheme: (theme) => {
    persistTheme(theme);
    set({ theme });
  },
  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    persistTheme(next);
    set({ theme: next });
  },
  setView: (view) => set({ view }),
  setScriptMode: (scriptMode) => set({ scriptMode }),
  togglePresets: () => set({ presetsOpen: !get().presetsOpen }),
  setPresetsOpen: (open) => set({ presetsOpen: open }),
}));
