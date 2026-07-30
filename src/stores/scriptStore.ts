import { create } from 'zustand';
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);


// const SAMPLE = `# A short demo. Edit me.
// Set Theme dracula
// Set Title hello world
// Set FontSize 18

// Type "chartscii 1 2 3 4 5 -e -c 'gradient(cyan,pink)' -w 50"
// Sleep 300ms
// Enter
// Sleep 1s
// `;

const MOBILE_SAMPLE = `
# Intro Demo

Set FontSize 60
Set Template minimal
Set Width 1200
Set Height 800
Set Theme {"name":"neon","background":"#0D0208","foreground":"#00ff9f","cursor":"#ff00ff","selection":"#264f78","black":"#1a1a2e","red":"#ff2e63","green":"#00ff9f","yellow":"#ffcc00","blue":"#00d4ff","magenta":"#ff00ff","cyan":"#00ffd5","white":"#e0e0e0","brightBlack":"#3a3a5e","brightRed":"#ff5c8a","brightGreen":"#50ffb8","brightYellow":"#ffdd33","brightBlue":"#33e5ff","brightMagenta":"#ff66ff","brightCyan":"#66ffe8","brightWhite":"#ffffff"}
Set LoopStyle fade
Set Watermark "tool3/dvd-cli"
Set Background #C9C7AF
Set BackgroundPadding 50
Set CursorStyle bar
Set CursorColor black
Set PromptPrefix "\x1b[38;5;206m\x1b[0m "

Type@100ms "Wake up, Neo..."
Sleep 1s
Ctrl+U
Sleep 500ms

Type@200ms "The Matrix has you..."
Sleep 2s
Ctrl+U
Sleep 1s
Type "Follow the white rabbit."
Sleep 3s
Ctrl+U
Sleep 1s
Type "Neo."
Sleep 1s
Space
Type "Knock, knock."

Sleep 1s

`

const SAMPLE = isMobile ? MOBILE_SAMPLE : `

# Intro Demo

# Set FontSize 60
# Set Template minimal
# Set Width 2000
Set LoopStyle fade
Set Watermark "tool3/dvd-cli"
Set Background "gradient(#ff7a59, #7c2bff:diagonal)"
Set BackgroundPadding 64
Set CursorStyle bar
Set CursorColor #d35cff
# Set PromptPrefix "[38;5;206m[0m "
Set Theme monokai
Set Padding 18
Set BorderRadius 16
Set BackgroundRadius 24

Type "chartscii 1 2 3 4 5 -c 'gradient(pink, cyan)' -e"
Enter
Sleep 3s

`

interface ScriptState {
  /** The .cd source. The single source of truth for the Script view. */
  source: string;
  setSource: (s: string) => void;
}

export const useScriptStore = create<ScriptState>((set) => ({
  source: SAMPLE,
  setSource: (source) => set({ source }),
}));
