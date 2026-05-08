/**
 * Two CodeMirror themes — dark and light — sharing the same accent palette
 * so the editor feels consistent when the app theme is toggled.
 */

import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

export type EditorTheme = 'dark' | 'light';

interface Palette {
  bg: string;
  bgGutter: string;
  bgSelection: string;
  bgActiveLine: string;
  cursor: string;
  text: string;
  muted: string;
  border: string;
  command: string;
  key: string;
  string: string;
  unit: string;
  number: string;
  setting: string;
  comment: string;
}

const DARK: Palette = {
  bg: '#0a0a0a',
  bgGutter: '#0a0a0a',
  bgSelection: 'rgba(124, 95, 255, 0.22)',
  bgActiveLine: 'rgba(255, 255, 255, 0.025)',
  cursor: '#7c5fff',
  text: '#ededed',
  muted: '#6e6e6e',
  border: '#1a1a1a',
  command: '#bca6ff',
  key: '#7cd2ff',
  string: '#a6e3a1',
  unit: '#ffd07a',
  number: '#ffd07a',
  setting: '#ffb1e3',
  comment: '#5a5a5a',
};

const LIGHT: Palette = {
  bg: '#ffffff',
  bgGutter: '#ffffff',
  bgSelection: 'rgba(124, 95, 255, 0.16)',
  bgActiveLine: 'rgba(0, 0, 0, 0.025)',
  cursor: '#7c5fff',
  text: '#1a1a1a',
  muted: '#9a9a9a',
  border: '#ececec',
  command: '#7c5fff', // purple
  key: '#0e7faa', // cyan
  string: '#1f8a3a', // green
  unit: '#b06400', // amber
  number: '#b06400',
  setting: '#c8366f', // pink
  comment: '#9a9a9a',
};

const buildTheme = (p: Palette, dark: boolean) =>
  EditorView.theme(
    {
      '&': {
        backgroundColor: p.bg,
        color: p.text,
        height: '100%',
      },
      '.cm-scroller': {
        fontFamily: "'SF Mono', 'JetBrains Mono', 'Menlo', 'Consolas', monospace",
        fontSize: '13px',
        lineHeight: '1.55',
      },
      '.cm-content': {
        caretColor: p.cursor,
        padding: '12px 0',
      },
      '.cm-gutters': {
        backgroundColor: p.bgGutter,
        color: p.muted,
        border: 'none',
        borderRight: `1px solid ${p.border}`,
      },
      '.cm-gutterElement': {
        padding: '0 12px 0 16px',
        fontSize: '11px',
      },
      '.cm-lineNumbers .cm-gutterElement': {
        minWidth: '24px',
        textAlign: 'right',
      },
      '.cm-activeLine': {
        backgroundColor: p.bgActiveLine,
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'transparent',
        color: p.text,
      },
      '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: p.cursor,
        borderLeftWidth: '2px',
      },
      '&.cm-focused .cm-selectionBackground, ::selection': {
        backgroundColor: p.bgSelection,
      },
      '.cm-selectionBackground': {
        backgroundColor: p.bgSelection,
      },
      '.cm-matchingBracket, .cm-nonmatchingBracket': {
        backgroundColor: 'rgba(124, 95, 255, 0.18)',
        outline: 'none',
      },
    },
    { dark },
  );

const buildHighlight = (p: Palette) =>
  HighlightStyle.define([
    { tag: t.lineComment, color: p.comment, fontStyle: 'italic' },
    { tag: t.keyword, color: p.command, fontWeight: '500' },
    { tag: t.controlKeyword, color: p.key },
    { tag: t.propertyName, color: p.setting },
    { tag: t.string, color: p.string },
    { tag: t.unit, color: p.unit },
    { tag: t.number, color: p.number },
    { tag: t.name, color: p.text },
  ]);

const darkTheme = buildTheme(DARK, true);
const darkHighlight = syntaxHighlighting(buildHighlight(DARK));
const lightTheme = buildTheme(LIGHT, false);
const lightHighlight = syntaxHighlighting(buildHighlight(LIGHT));

export const editorThemeBundle = (mode: EditorTheme) =>
  mode === 'dark' ? [darkTheme, darkHighlight] : [lightTheme, lightHighlight];
