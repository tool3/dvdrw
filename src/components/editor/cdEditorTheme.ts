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

// Editor backgrounds use a near-transparent ink so the parent card's
// glass and the body's ambient mesh both shimmer through. Selection &
// cursor pick up the new iris-violet accent.
const DARK: Palette = {
  bg: 'rgba(6, 8, 14, 0.6)',
  bgGutter: 'rgba(6, 8, 14, 0.4)',
  bgSelection: 'rgba(166, 152, 255, 0.22)',
  bgActiveLine: 'rgba(255, 255, 255, 0.025)',
  cursor: '#A698FF',
  text: '#F5F4FB',
  muted: '#6E6C85',
  border: 'rgba(255, 255, 255, 0.06)',
  command: '#C7BCFF',
  key: '#7CD2FF',
  string: '#A6E3A1',
  unit: '#FFD07A',
  number: '#FFD07A',
  setting: '#FFB1E3',
  comment: '#4F4D63',
};

const LIGHT: Palette = {
  bg: 'rgba(255, 255, 255, 0.7)',
  bgGutter: 'rgba(255, 255, 255, 0.4)',
  bgSelection: 'rgba(106, 86, 240, 0.18)',
  bgActiveLine: 'rgba(15, 15, 25, 0.03)',
  cursor: '#6A56F0',
  text: '#14111F',
  muted: '#8E8AA0',
  border: 'rgba(15, 15, 25, 0.06)',
  command: '#5C49DF',
  key: '#0E7FAA',
  string: '#1F8A3A',
  unit: '#B06400',
  number: '#B06400',
  setting: '#C8366F',
  comment: '#A09CB0',
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
        fontFamily:
          "'JetBrains Mono', 'SF Mono', 'Menlo', 'Consolas', monospace",
        fontSize: '13px',
        lineHeight: '1.6',
        fontFeatureSettings: '"calt" 1, "ss01" 1',
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
