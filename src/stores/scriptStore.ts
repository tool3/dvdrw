import { create } from 'zustand';
import { defaultScriptSource } from '../lib/examples';

const isMobile =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );

interface ScriptState {
  /** The .cd source. The single source of truth for the Script view. */
  source: string;
  setSource: (s: string) => void;
}

export const useScriptStore = create<ScriptState>((set) => ({
  source: defaultScriptSource(isMobile),
  setSource: (source) => set({ source }),
}));
