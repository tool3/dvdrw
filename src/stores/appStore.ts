import { create } from 'zustand';
import type { VideoQuality } from 'dvdrw';
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
  /** Detail tier for MP4 export. Lives here rather than in the options
   *  store on purpose: options changes trigger the Runner's auto-rerun,
   *  and picking a video quality must not re-execute the user's
   *  container commands. Persisted to localStorage. */
  videoQuality: VideoQuality;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setView: (view: View) => void;
  setAutoRun: (autoRun: boolean) => void;
  toggleAutoRun: () => void;
  setBrandColor: (hex: string) => void;
  setVideoQuality: (quality: VideoQuality) => void;
}

const VIDEO_QUALITY_KEY = 'dvdrw.videoQuality';

const readInitialVideoQuality = (): VideoQuality => {
  try {
    const stored = localStorage.getItem(VIDEO_QUALITY_KEY);
    if (stored === 'low' || stored === 'medium' || stored === 'high') {
      return stored;
    }
  } catch {
    /* ignore */
  }
  return 'medium';
};

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
  videoQuality: readInitialVideoQuality(),
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
  setVideoQuality: (videoQuality) => {
    try {
      localStorage.setItem(VIDEO_QUALITY_KEY, videoQuality);
    } catch {
      /* ignore */
    }
    set({ videoQuality });
  },
}));
