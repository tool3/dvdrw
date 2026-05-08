import { create } from 'zustand';

const SAMPLE = `# A short demo. Edit me.
Set Theme dracula
Set Title hello world
Set FontSize 18

Type "chartscii 1 2 3 4 5 -e -c 'gradient(cyan,pink)'"
Sleep 300ms
Enter
Sleep 1s
`;

interface ScriptState {
  /** The .cd source. The single source of truth for the Script view. */
  source: string;
  setSource: (s: string) => void;
}

export const useScriptStore = create<ScriptState>((set) => ({
  source: SAMPLE,
  setSource: (source) => set({ source }),
}));
