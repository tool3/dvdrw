/**
 * Ready-made demos offered in the UI.
 *
 * Infrastructure, not curation: add, remove or reorder entries and both
 * pickers follow. Each list drives one picker — `SCRIPT_EXAMPLES` loads a
 * .cd source into the editor, `CAST_EXAMPLES` fills the cast URL field.
 *
 * `mobileDefault` marks the script the editor opens with on a phone, where
 * the shell-driven demos are too wide to read.
 */

export interface ScriptExample {
  id: string;
  label: string;
  /** One line, shown under the label in the menu. */
  description?: string;
  source: string;
  mobileDefault?: boolean;
}

export interface CastExample {
  id: string;
  label: string;
  description?: string;
  url: string;
}

export const SCRIPT_EXAMPLES: ScriptExample[] = [
  {
    id: 'chartscii',
    label: 'Chartscii',
    description: 'Runs a real command in the container and charts the output.',
    source: `# Intro Demo

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

`,
  },
  {
    id: 'matrix',
    label: 'Matrix scene',
    description: 'Typed dialogue on a neon theme. No shell needed.',
    mobileDefault: true,
    source: `# Intro Demo

Set FontSize 20
Set Template minimal
Set Width 500
Set Height 400
Set Theme {"name":"neon","background":"#0D0208","foreground":"#00ff9f","cursor":"#ff00ff","selection":"#264f78","black":"#1a1a2e","red":"#ff2e63","green":"#00ff9f","yellow":"#ffcc00","blue":"#00d4ff","magenta":"#ff00ff","cyan":"#00ffd5","white":"#e0e0e0","brightBlack":"#3a3a5e","brightRed":"#ff5c8a","brightGreen":"#50ffb8","brightYellow":"#ffdd33","brightBlue":"#33e5ff","brightMagenta":"#ff66ff","brightCyan":"#66ffe8","brightWhite":"#ffffff"}
Set LoopStyle fade
Set Watermark "tool3/dvd-cli"
Set Background #C9C7AF
Set BackgroundPadding 50
Set CursorStyle bar
Set CursorColor black
Set PromptPrefix "[38;5;206m[0m "

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



`,
  },
];

export const CAST_EXAMPLES: CastExample[] = [
  {
    id: 'asciinema-427282',
    label: 'Sample cast',
    description: 'asciinema.org/a/427282',
    url: 'https://asciinema.org/a/427282',
  },
];

export const scriptExample = (id: string): ScriptExample | undefined =>
  SCRIPT_EXAMPLES.find((e) => e.id === id);

/** The source the editor opens with. Phones get the `mobileDefault`. */
export const defaultScriptSource = (isMobile: boolean): string => {
  const preferred = isMobile
    ? SCRIPT_EXAMPLES.find((e) => e.mobileDefault)
    : undefined;
  return (preferred ?? SCRIPT_EXAMPLES[0]).source;
};
