import { create } from 'zustand';
import { applyBrand, readStoredBrand, storeBrand } from '../lib/brandTheme';

export type Theme = 'dark' | 'light';
export type View = 'script' | 'cast';

interface AppState {
  theme: Theme;
  view: View;
  /** Whether the runner re-runs automatically when the source/options
   *  change. Toggled via the Auto/Manual chip in the Runner toolbar. */
  autoRun: boolean;
  /** App-wide brand color (hex). Drives every accent variant, the
   *  ambient background blobs, the favicon, and the mobile browser
   *  theme-color meta. Persisted to localStorage. */
  brandColor: string;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setView: (view: View) => void;
  setAutoRun: (autoRun: boolean) => void;
  toggleAutoRun: () => void;
  setBrandColor: (hex: string) => void;
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

const readInitialBrand = (): string => {
  // Apply the stored brand synchronously during store construction so
  // the first paint already uses the right accents — otherwise the UI
  // flashes the default iris-violet for one frame before swapping.
  const hex = readStoredBrand();
  if (typeof document !== 'undefined') applyBrand(hex);
  return hex;
};

export const useAppStore = create<AppState>((set, get) => ({
  theme: readInitialTheme(),
  view: 'script',
  autoRun: true,
  brandColor: readInitialBrand(),
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
  setBrandColor: (hex) => {
    applyBrand(hex);
    storeBrand(hex);
    set({ brandColor: hex });
  },
}));
