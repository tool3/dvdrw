/**
 * Autocomplete for `.cd` scripts.
 *
 * The format is line-oriented, which makes completion context cheap to
 * work out from the current line alone — no parse tree needed:
 *
 *   <start of line>        → commands and keys
 *   `Set ` + word          → setting names
 *   `Set <Setting> ` + word → that setting's allowed values
 *
 * The vocabulary is deliberately the real one: setting names mirror the
 * handler map in dvd's `executor/settings.ts`, so anything offered here is
 * something the CLI will actually apply.
 */

import type {
  Completion,
  CompletionContext,
  CompletionResult,
} from '@codemirror/autocomplete';
import { themes as builtinThemes } from 'dvdrw';

/* ------------------------------------------------------------------ */
/*                              Vocabulary                            */
/* ------------------------------------------------------------------ */

interface Entry {
  label: string;
  detail?: string;
  info?: string;
}

const COMMANDS: Entry[] = [
  { label: 'Type', detail: '"text"', info: 'Type text into the terminal, one character at a time. `Type@50ms "…"` sets the per-character speed.' },
  { label: 'Sleep', detail: '500ms', info: 'Pause. Accepts ms or s — `Sleep 300ms`, `Sleep 1.5s`.' },
  { label: 'Set', detail: 'Setting value', info: 'Change a setting for the rest of the script.' },
  { label: 'Wait', info: 'Wait for the running command to produce output.' },
  { label: 'Hide', info: 'Hide the cursor from here on.' },
  { label: 'Show', info: 'Show the cursor again.' },
  { label: 'Output', detail: 'file.svg', info: 'Where the CLI writes the result. Ignored in the web app.' },
  { label: 'Source', detail: 'other.cd', info: 'Inline another .cd script. CLI only.' },
  { label: 'Require', detail: 'command', info: 'Fail early unless a command exists. CLI only.' },
  { label: 'Env', detail: 'KEY value', info: 'Set an environment variable for spawned commands.' },
  { label: 'Screenshot', detail: 'file.png', info: 'Capture a still at this point. CLI only.' },
  { label: 'Copy', info: 'Copy the current selection.' },
  { label: 'Paste', info: 'Paste the clipboard.' },
];

const KEYS: Entry[] = [
  { label: 'Enter', info: 'Press Enter — runs whatever has been typed.' },
  { label: 'Tab' },
  { label: 'Space' },
  { label: 'Backspace', detail: '3', info: 'Delete backwards. Takes an optional repeat count.' },
  { label: 'Up' },
  { label: 'Down' },
  { label: 'Left' },
  { label: 'Right' },
];

const SHORTCUTS: Entry[] = [
  { label: 'Ctrl+C', info: 'Interrupt the current line.' },
  { label: 'Ctrl+U', info: 'Clear the current line.' },
  { label: 'Ctrl+L', info: 'Clear the screen.' },
  { label: 'Ctrl+A', info: 'Jump to the start of the line.' },
  { label: 'Ctrl+E', info: 'Jump to the end of the line.' },
];

/**
 * Every `Set` directive dvd understands, grouped so the dropdown reads in a
 * sensible order rather than alphabetically. `detail` shows the expected
 * value shape, which is most of what you want from a completion list.
 */
const SETTINGS: Entry[] = [
  // Look
  { label: 'Theme', detail: 'name | {json}', info: 'A built-in theme name, or an inline JSON palette.' },
  { label: 'Template', detail: 'macos | windows | minimal' },
  { label: 'Title', detail: 'text', info: 'Window title, shown in the title bar.' },
  { label: 'Watermark', detail: 'text' },
  { label: 'WatermarkStyle', detail: 'style' },

  // Type
  { label: 'FontSize', detail: 'px' },
  { label: 'FontFamily', detail: 'name' },
  { label: 'LineHeight', detail: 'multiplier', info: 'Multiplier, minimum 1. Default 1.4.' },
  { label: 'LetterSpacing', detail: 'px' },
  { label: 'EmbedFont', detail: 'path', info: 'Embed a font file so the SVG renders identically everywhere.' },

  // Frame
  { label: 'Width', detail: 'px', info: 'Fixed width. Omit to auto-fit the content.' },
  { label: 'Height', detail: 'px', info: 'Fixed height. Omit to auto-fit the content.' },
  { label: 'Padding', detail: 'px' },
  { label: 'BorderRadius', detail: 'px' },
  { label: 'BorderWidth', detail: 'px' },
  { label: 'BorderColor', detail: '#hex' },
  { label: 'Scroll', detail: 'true | false', info: 'Scroll the viewport instead of growing the canvas.' },

  // Backdrop
  { label: 'Background', detail: '#hex | gradient(…)', info: 'Colour behind the window. `gradient(#a, #b:diagonal)` also works.' },
  { label: 'BackgroundPadding', detail: 'px | "10 20"', info: 'Margin around the window. Accepts CSS-style shorthand.' },
  { label: 'BackgroundRadius', detail: 'px' },

  // Cursor
  { label: 'CursorStyle', detail: 'block | bar | underline' },
  { label: 'CursorColor', detail: '#hex' },
  { label: 'CursorBlink', detail: 'true | false' },
  { label: 'PromptPrefix', detail: '"❯ "', info: 'The prompt drawn before each typed line. Escapes like \\x1b[95m work.' },

  // Header / footer
  { label: 'HeaderHeight', detail: 'px' },
  { label: 'HeaderBackground', detail: '#hex' },
  { label: 'HeaderBorder', detail: 'true | false' },
  { label: 'HeaderBorderColor', detail: '#hex' },
  { label: 'HeaderBorderWidth', detail: 'px' },
  { label: 'FooterHeight', detail: 'px' },
  { label: 'FooterBackground', detail: '#hex' },
  { label: 'FooterBorder', detail: 'true | false' },
  { label: 'FooterBorderColor', detail: '#hex' },
  { label: 'FooterBorderWidth', detail: 'px' },

  // Timing
  { label: 'TypingSpeed', detail: 'ms', info: 'Milliseconds per character. Default 50.' },
  { label: 'PlaybackSpeed', detail: 'multiplier', info: '2 plays twice as fast.' },
  { label: 'AnimationSpeed', detail: 'ms', info: 'Frame interval for in-place shell animations.' },
  { label: 'LoopStyle', detail: 'loop | reverse | rewind | fade' },
  { label: 'LoopPause', detail: 'ms', info: 'Wait before the animation restarts.' },
  { label: 'FadeDuration', detail: 'ms', info: 'Only used by the fade loop style.' },
  { label: 'RewindSpeed', detail: 'multiplier', info: 'Only used by the rewind loop style.' },

  // Shell
  { label: 'Shell', detail: 'bash | zsh | sh' },
  { label: 'WorkingDirectory', detail: 'path' },
  { label: 'CharWidthRatio', detail: 'ratio', info: 'Advance width per character, as a fraction of font size. Default 0.6.' },
];

const BOOLEANS: Entry[] = [{ label: 'true' }, { label: 'false' }];

/** Allowed values, for the settings that take a fixed set. */
const SETTING_VALUES: Record<string, Entry[]> = {
  Template: [
    { label: 'macos', info: 'Traffic-light window chrome.' },
    { label: 'windows', info: 'Windows-style window chrome.' },
    { label: 'minimal', info: 'No chrome at all — just the terminal.' },
  ],
  LoopStyle: [
    { label: 'loop', info: 'Jump straight back to the first frame.' },
    { label: 'reverse', info: 'Play backwards, then forwards again.' },
    { label: 'rewind', info: 'Fast-rewind to the start.' },
    { label: 'fade', info: 'Fade out and back in.' },
  ],
  CursorStyle: [{ label: 'block' }, { label: 'bar' }, { label: 'underline' }],
  Shell: [{ label: 'bash' }, { label: 'zsh' }, { label: 'sh' }, { label: 'fish' }],
  CursorBlink: BOOLEANS,
  Scroll: BOOLEANS,
  HeaderBorder: BOOLEANS,
  FooterBorder: BOOLEANS,
  // Read from the library so the list can never drift from what dvd ships.
  Theme: Object.keys(builtinThemes as Record<string, unknown>).map((name) => ({
    label: name,
  })),
};

/* ------------------------------------------------------------------ */
/*                             Completion                             */
/* ------------------------------------------------------------------ */

const toCompletions = (
  entries: Entry[],
  type: Completion['type'],
  boost?: number,
): Completion[] =>
  entries.map((e) => ({
    label: e.label,
    type,
    detail: e.detail,
    info: e.info,
    boost,
  }));

/** Word being typed, plus everything before it on the line. */
const lineContext = (context: CompletionContext) => {
  const line = context.state.doc.lineAt(context.pos);
  const beforeCursor = line.text.slice(0, context.pos - line.from);
  const word = /[\w+]*$/.exec(beforeCursor)?.[0] ?? '';
  return {
    line,
    beforeCursor,
    word,
    from: context.pos - word.length,
    /** Text before the word being typed, trimmed of leading indent. */
    prefix: beforeCursor.slice(0, beforeCursor.length - word.length).trim(),
  };
};

export const cdCompletion = (
  context: CompletionContext,
): CompletionResult | null => {
  const { line, beforeCursor, word, from, prefix } = lineContext(context);

  // Never complete inside a comment or a quoted string — those are prose,
  // and popping a menu up mid-sentence is the fastest way to make an
  // editor feel hostile.
  if (line.text.trimStart().startsWith('#')) return null;
  const quotes = (beforeCursor.match(/["']/g) ?? []).length;
  if (quotes % 2 === 1) return null;

  // `Set <Setting> ` → that setting's values.
  const setValue = /^Set\s+([A-Za-z][A-Za-z0-9]*)$/.exec(prefix);
  if (setValue) {
    const values = SETTING_VALUES[setValue[1]];
    if (!values) return null;
    return {
      from,
      options: toCompletions(values, 'enum'),
      validFor: /^[\w-]*$/,
    };
  }

  // `Set ` → setting names.
  if (prefix === 'Set') {
    return {
      from,
      options: toCompletions(SETTINGS, 'property'),
      validFor: /^\w*$/,
    };
  }

  // Start of a line → commands, keys and shortcuts. Explicit invocation
  // (Ctrl-Space) offers the list even with nothing typed yet.
  if (prefix === '') {
    if (!word && !context.explicit) return null;
    return {
      from,
      options: [
        ...toCompletions(COMMANDS, 'keyword', 2),
        ...toCompletions(KEYS, 'constant', 1),
        ...toCompletions(SHORTCUTS, 'constant'),
      ],
      validFor: /^[\w+]*$/,
    };
  }

  return null;
};
