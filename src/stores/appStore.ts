import { create } from 'zustand';

export type Theme = 'dark' | 'light';
export type View = 'script' | 'cast';

interface AppState {
  theme: Theme;
  view: View;
  /** Whether the runner re-runs automatically when the source/options
   *  change. Toggled via the Auto/Manual chip in the Runner toolbar. */
  autoRun: boolean;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setView: (view: View) => void;
  setAutoRun: (autoRun: boolean) => void;
  toggleAutoRun: () => void;
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
  autoRun: true,
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
  setAutoRun: (autoRun) => set({ autoRun }),
  toggleAutoRun: () => set({ autoRun: !get().autoRun }),
}));
