/**
 * CodeMirror StreamLanguage for .cd scripts.
 *
 * The .cd format is line-oriented:
 *   - lines starting with `#` are comments
 *   - first token on a line is a command name
 *   - some commands take a quoted string ("..." or '...')
 *   - durations look like 300ms / 1.5s
 *   - bare identifiers after Set are setting names
 */

import { StreamLanguage, LanguageSupport } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

const KEYWORDS = new Set([
  'Type',
  'Sleep',
  'Wait',
  'Hide',
  'Show',
  'Set',
  'Output',
  'Source',
  'Require',
  'Env',
  'Screenshot',
  'Copy',
  'Paste',
]);

const KEYS = new Set([
  'Enter',
  'Tab',
  'Space',
  'Backspace',
  'Up',
  'Down',
  'Left',
  'Right',
]);

const SHORTCUT_PARTS = new Set(['Ctrl', 'Alt', 'Shift', 'Cmd', 'Meta']);

interface CdState {
  lineStart: boolean;
  lastWasSet: boolean;
}

export const cdLanguage = StreamLanguage.define<CdState>({
  name: 'cd',
  startState: () => ({ lineStart: true, lastWasSet: false }),

  token(stream, state) {
    if (stream.sol()) {
      state.lineStart = true;
      state.lastWasSet = false;
    }

    if (stream.eatSpace()) return null;

    if (state.lineStart && stream.match(/#.*/)) {
      state.lineStart = false;
      return 'lineComment';
    }

    // Strings
    if (stream.match(/"(?:[^"\\]|\\.)*"/)) {
      state.lineStart = false;
      return 'string';
    }
    if (stream.match(/'(?:[^'\\]|\\.)*'/)) {
      state.lineStart = false;
      return 'string';
    }

    // Durations
    if (stream.match(/\d+(?:\.\d+)?\s*(?:ms|s)\b/)) {
      state.lineStart = false;
      return 'unit';
    }

    // Numbers
    if (stream.match(/-?\d+(?:\.\d+)?/)) {
      state.lineStart = false;
      return 'number';
    }

    // Identifiers (commands, keys, shortcut parts, setting names, values)
    const id = stream.match(/[A-Za-z_][A-Za-z0-9_-]*/) as RegExpMatchArray | null;
    if (id) {
      const word = id[0];
      const wasLineStart = state.lineStart;
      state.lineStart = false;

      if (wasLineStart) {
        if (KEYWORDS.has(word)) {
          state.lastWasSet = word === 'Set';
          return 'keyword';
        }
        if (KEYS.has(word)) return 'controlKeyword';
        if (SHORTCUT_PARTS.has(word)) return 'controlKeyword';
        // Unknown line-start words: still highlight as keyword so users know
        // the parser will try to read them as a command.
        return 'keyword';
      }

      if (state.lastWasSet) {
        state.lastWasSet = false;
        return 'propertyName';
      }

      if (KEYS.has(word)) return 'controlKeyword';
      if (SHORTCUT_PARTS.has(word)) return 'controlKeyword';

      return 'name';
    }

    // Punctuation, separators, anything else
    stream.next();
    return null;
  },

  languageData: {
    commentTokens: { line: '#' },
  },

  tokenTable: {
    lineComment: t.lineComment,
    string: t.string,
    unit: t.unit,
    number: t.number,
    keyword: t.keyword,
    controlKeyword: t.controlKeyword,
    propertyName: t.propertyName,
    name: t.name,
  },
});

export const cd = () => new LanguageSupport(cdLanguage);
