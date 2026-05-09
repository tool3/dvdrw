/**
 * Bidirectional sync helpers between optionsStore and the .cd source.
 *
 * The .cd file is the persistent source of truth. The menu writes into it
 * via `Set X Y` directives, and reading the file back populates the menu.
 * Both sides apply changes only when values actually differ, so a roundtrip
 * (menu change → patch script → re-parse → set options to same value)
 * terminates after one fixed-point pass.
 */

import type { RenderOptions } from '../stores/optionsStore';
import type { CustomTheme } from '../stores/customThemesStore';

/**
 * Set-directive name (left side) for each syncable RenderOptions key.
 * Keys with no .cd Set equivalent (engine, fps, optimize, loop, pauseAtEnd)
 * are deliberately absent — those stay menu-only.
 */
const SETTING_TO_OPTION = {
  Theme: 'theme',
  Title: 'title',
  Watermark: 'watermark',
  Template: 'template',
  FontSize: 'fontSize',
  LineHeight: 'lineHeight',
  LetterSpacing: 'letterSpacing',
  Padding: 'padding',
  BorderRadius: 'borderRadius',
  BorderWidth: 'borderWidth',
  BorderColor: 'borderColor',
  CursorStyle: 'cursorStyle',
  CursorBlink: 'cursorBlink',
  CursorColor: 'cursorColor',
  Background: 'background',
  BackgroundPadding: 'backgroundPadding',
  BackgroundRadius: 'backgroundRadius',
  LoopStyle: 'loopStyle',
} as const;

type SettingName = keyof typeof SETTING_TO_OPTION;
type OptionKey = (typeof SETTING_TO_OPTION)[SettingName];

const OPTION_TO_SETTING = Object.fromEntries(
  Object.entries(SETTING_TO_OPTION).map(([k, v]) => [v, k]),
) as Record<OptionKey, SettingName>;

/** Keys whose value type is number and must be parsed/serialized as such. */
const NUMERIC_KEYS = new Set<OptionKey>([
  'fontSize',
  'lineHeight',
  'letterSpacing',
  'padding',
  'borderRadius',
  'borderWidth',
  'backgroundPadding',
  'backgroundRadius',
]);

const BOOLEAN_KEYS = new Set<OptionKey>(['cursorBlink']);

/** Keys whose value can hold an inline `{...}` JSON theme blob — Theme only. */
const isThemeKey = (k: OptionKey): k is 'theme' => k === 'theme';

/* ------------------------------------------------------------------ */
/*                              Extract                               */
/* ------------------------------------------------------------------ */

/**
 * Walk the .cd source line-by-line and collect the trailing value for each
 * known `Set X` directive. Last occurrence wins (mirrors dvd's behavior).
 *
 * The `customThemes` lookup lets us re-attach a saved custom theme when a
 * `Set Theme {json}` directive matches one we know about. If a JSON theme
 * doesn't match any saved custom theme, we keep the literal string —
 * webcontainer flags / the in-memory render path can still read it.
 */
export const extractSettings = (
  source: string,
  customThemes: CustomTheme[] = [],
): Partial<RenderOptions> => {
  const out: Partial<RenderOptions> = {};
  for (const rawLine of source.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('Set ')) continue;

    // `Set <name> <value...>` — the name is the second token, value is the
    // rest of the line so values can contain spaces.
    const rest = line.slice(4).trimStart();
    const space = rest.search(/\s/);
    if (space < 0) continue;
    const name = rest.slice(0, space);
    const value = rest.slice(space + 1).trim();
    if (!(name in SETTING_TO_OPTION)) continue;

    const key = SETTING_TO_OPTION[name as SettingName];
    const parsed = parseSettingValue(key, value, customThemes);
    if (parsed !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (out as any)[key] = parsed;
    }
  }
  return out;
};

const parseSettingValue = (
  key: OptionKey,
  raw: string,
  customThemes: CustomTheme[],
): unknown => {
  // Strip surrounding quotes if present
  let value = raw;
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  if (isThemeKey(key) && value.trim().startsWith('{')) {
    // Inline JSON theme. Match against known custom themes by the colors
    // they declare; if it matches, return the custom-id so the picker can
    // highlight the right card. Otherwise keep the JSON literal so the
    // run path passes it through unchanged.
    try {
      const parsed = JSON.parse(value);
      const match = customThemes.find((t) =>
        themesShallowEqual(t as unknown as Record<string, unknown>, parsed),
      );
      if (match) return match.id;
      return value;
    } catch {
      return value;
    }
  }

  if (NUMERIC_KEYS.has(key)) {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? n : undefined;
  }

  if (BOOLEAN_KEYS.has(key)) {
    return value.toLowerCase() === 'true';
  }

  return value;
};

export const THEME_COLOR_KEYS = [
  'background',
  'foreground',
  'cursor',
  'selection',
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite',
] as const;

/**
 * If `themeValue` is a literal `{...}` JSON blob from a `Set Theme {…}`
 * directive AND it parses as a complete CustomTheme (every color key
 * present and stringly typed), return the parsed colors + an inferred
 * name. Otherwise return null. Used by the sync layer to auto-promote
 * inline themes into saved CustomThemes the moment they appear in the
 * script.
 */
export const parseInlineTheme = (
  themeValue: unknown,
): Omit<CustomTheme, 'id'> | null => {
  if (typeof themeValue !== 'string') return null;
  if (!themeValue.trim().startsWith('{')) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(themeValue) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  for (const k of THEME_COLOR_KEYS) {
    if (typeof parsed[k] !== 'string') return null;
  }
  const out = { name: typeof parsed.name === 'string' ? parsed.name : 'Custom theme' } as Omit<
    CustomTheme,
    'id'
  >;
  for (const k of THEME_COLOR_KEYS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (out as any)[k] = parsed[k];
  }
  return out;
};

const themesShallowEqual = (
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): boolean => {
  for (const k of THEME_COLOR_KEYS) {
    if (String(a[k]).toLowerCase() !== String(b[k]).toLowerCase()) return false;
  }
  return true;
};

/* ------------------------------------------------------------------ */
/*                                Patch                               */
/* ------------------------------------------------------------------ */

/**
 * Write a single option value into the .cd source by inserting or replacing
 * the matching `Set X Y` line. Returns the modified source.
 *
 * Behaviour rules:
 *   • undefined / empty string ⇒ remove the existing Set line if any.
 *   • value that already matches the existing Set ⇒ no-op (returns input).
 *   • new value ⇒ replace the existing Set line in place; if none exists,
 *     insert just after the last existing `Set` block (or at the top).
 */
export const patchSetting = (
  source: string,
  optionKey: OptionKey,
  value: unknown,
  customThemes: CustomTheme[] = [],
): string => {
  const settingName = OPTION_TO_SETTING[optionKey];
  if (!settingName) return source;

  const serialized = serializeValue(optionKey, value, customThemes);
  const setRe = new RegExp(`^\\s*Set\\s+${settingName}\\b.*$`, 'm');

  if (serialized === null) {
    // Remove the line + the trailing newline if it owns one.
    const removeRe = new RegExp(`^\\s*Set\\s+${settingName}\\b.*(?:\\r?\\n|$)`, 'm');
    return source.replace(removeRe, '');
  }

  const newLine = `Set ${settingName} ${serialized}`;

  if (setRe.test(source)) {
    // Already present — replace in place if different, else no-op.
    const current = source.match(setRe)?.[0] ?? '';
    if (current.trim() === newLine) return source;
    return source.replace(setRe, newLine);
  }

  // Not present — insert after the last existing Set line (so all Set
  // directives stay clustered at the top), else at line 0.
  const lines = source.split('\n');
  let insertAt = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*Set\s+/.test(lines[i])) insertAt = i + 1;
    else if (insertAt > 0 && lines[i].trim() === '') break; // stop after the Set block
  }
  lines.splice(insertAt, 0, newLine);
  return lines.join('\n');
};

const serializeValue = (
  key: OptionKey,
  value: unknown,
  customThemes: CustomTheme[],
): string | null => {
  if (value === undefined || value === null || value === '') return null;

  if (isThemeKey(key) && typeof value === 'string' && value.startsWith('custom-')) {
    const found = customThemes.find((t) => t.id === value);
    if (!found) return null;
    // Strip our internal id/name so the JSON dvd sees is just colors.
    const { id, ...rest } = found;
    void id;
    return JSON.stringify(rest);
  }

  // An inline JSON theme typed by the user lives in options.theme as a raw
  // `{...}` string. Emit it verbatim so the generic string path doesn't
  // wrap braces+whitespace in quotes and break the directive on roundtrip.
  if (isThemeKey(key) && typeof value === 'string' && value.trim().startsWith('{')) {
    return value.trim();
  }

  if (BOOLEAN_KEYS.has(key)) return value ? 'true' : 'false';
  if (NUMERIC_KEYS.has(key)) return String(value);

  // Strings: titles / watermarks / backgrounds may have spaces. Quote them
  // when they contain whitespace so the parser groups the value correctly.
  const str = String(value);
  return /\s/.test(str) ? `"${str.replace(/"/g, '\\"')}"` : str;
};
