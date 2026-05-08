import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * Shape mirrors the dvd Theme so we can serialize a custom theme directly
 * into a `Set Theme {json}` directive without any field translation.
 */
export interface CustomTheme {
  id: string; // 'custom-<timestamp>'
  name: string;
  background: string;
  foreground: string;
  cursor: string;
  selection: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

interface CustomThemesState {
  themes: CustomTheme[];
  addTheme: (theme: CustomTheme) => void;
  updateTheme: (id: string, patch: Omit<CustomTheme, 'id'>) => void;
  deleteTheme: (id: string) => void;
}

export const useCustomThemesStore = create<CustomThemesState>()(
  persist(
    (set) => ({
      themes: [],
      addTheme: (theme) => set((state) => ({ themes: [...state.themes, theme] })),
      updateTheme: (id, patch) =>
        set((state) => ({
          themes: state.themes.map((t) => (t.id === id ? { ...patch, id } : t)),
        })),
      deleteTheme: (id) =>
        set((state) => ({ themes: state.themes.filter((t) => t.id !== id) })),
    }),
    {
      name: 'dvdrw.customThemes',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export const newCustomThemeId = (): string => `custom-${Date.now()}`;
