import { useEffect, useRef } from 'react';
import { useScriptStore } from '../stores/scriptStore';
import {
  DEFAULT_OPTIONS,
  useOptionsStore,
  type RenderOptions,
} from '../stores/optionsStore';
import {
  newCustomThemeId,
  useCustomThemesStore,
  type CustomTheme,
} from '../stores/customThemesStore';
import { extractSettings, parseInlineTheme, patchSetting } from './scriptSync';

/**
 * Keys with a corresponding `Set X` directive in the .cd format. Other
 * optionsStore keys (engine, fps, optimize, loop, pauseAtEnd,
 * cursorVisible) stay menu-only and never touch the script.
 *
 * Shared between the options→script subscriber (which knows which keys
 * to mirror outward) and the script→options subscriber (which resets
 * any absent key back to its default — so commenting out / deleting a
 * `Set Watermark` line clears the watermark, the same as toggling it
 * off via the menu).
 */
export type SyncableKey =
  | 'theme'
  | 'title'
  | 'watermark'
  | 'template'
  | 'fontSize'
  | 'lineHeight'
  | 'letterSpacing'
  | 'padding'
  | 'width'
  | 'height'
  | 'borderRadius'
  | 'borderWidth'
  | 'borderColor'
  | 'cursorStyle'
  | 'cursorBlink'
  | 'cursorColor'
  | 'background'
  | 'backgroundPadding'
  | 'backgroundRadius'
  | 'loopStyle'
  | 'loopPause'
  | 'fadeDuration'
  | 'rewindSpeed'
  | 'playbackSpeed'
  | 'customGlyphs';

const SYNCABLE_KEYS: readonly SyncableKey[] = [
  'theme',
  'title',
  'watermark',
  'template',
  'fontSize',
  'lineHeight',
  'letterSpacing',
  'padding',
  'width',
  'height',
  'borderRadius',
  'borderWidth',
  'borderColor',
  'cursorStyle',
  'cursorBlink',
  'cursorColor',
  'background',
  'backgroundPadding',
  'backgroundRadius',
  'loopStyle',
  'loopPause',
  'fadeDuration',
  'rewindSpeed',
  'playbackSpeed',
  'customGlyphs',
];

/**
 * If the script declares an inline `Set Theme {…}` blob and the JSON is a
 * complete CustomTheme, save it to the library and rewrite settings.theme
 * to point at the new id. The next render of the picker will show the
 * new card already selected; no separate "Inline" affordance needed.
 */
const promoteInlineThemeIfAny = (settings: Partial<RenderOptions>): void => {
  const colors = parseInlineTheme(settings.theme);
  if (!colors) return;
  const newTheme: CustomTheme = { ...colors, id: newCustomThemeId() };
  useCustomThemesStore.getState().addTheme(newTheme);
  settings.theme = newTheme.id;
};

/**
 * Build a full options patch from the script's extracted settings: keys
 * the script declared get the parsed value; keys it doesn't mention
 * fall back to `DEFAULT_OPTIONS`. This is what makes removing /
 * commenting out a `Set X` line actually reset option X — the previous
 * implementation only merged in the keys it found, so a deleted
 * directive left a stale value in optionsStore forever.
 */
const buildPatchFromScript = (
  extracted: Partial<RenderOptions>,
): Partial<RenderOptions> => {
  const patch: Partial<RenderOptions> = {};
  for (const key of SYNCABLE_KEYS) {
    if (key in extracted) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (patch as any)[key] = (extracted as any)[key];
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (patch as any)[key] = (DEFAULT_OPTIONS as any)[key];
    }
  }
  return patch;
};

/**
 * Bidirectional sync between the .cd source and optionsStore.
 *
 * Mount once inside EditorView (the only view backed by a script). It
 *   1. parses the script's `Set` directives on first mount and pushes them
 *      into optionsStore so the menu reflects whatever the file declares,
 *   2. listens for menu changes and patches the script when a syncable
 *      option moves,
 *   3. listens for script edits and re-derives optionsStore values from
 *      the parsed Sets.
 *
 * Loop avoidance: a "syncing" ref is set during outbound writes so the
 * inbound subscriber ignores the change it just emitted. Combined with
 * value-equality checks before patching, the system reaches a stable
 * fixed point in one round.
 */
export const useScriptOptionsSync = () => {
  const customThemes = useCustomThemesStore((s) => s.themes);
  const customThemesRef = useRef(customThemes);
  customThemesRef.current = customThemes;

  // `syncing` flips on while we're applying an outbound patch so the
  // matching inbound subscription can ignore the echo.
  const syncing = useRef(false);

  // 1) Initial extract: walk the script once and push values into options.
  useEffect(() => {
    const initialSource = useScriptStore.getState().source;
    const settings = extractSettings(initialSource, customThemesRef.current);
    promoteInlineThemeIfAny(settings);
    const patch = buildPatchFromScript(settings);
    const current = useOptionsStore.getState().options;
    const diff: Partial<RenderOptions> = {};
    for (const [k, v] of Object.entries(patch)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!Object.is((current as any)[k], v)) (diff as any)[k] = v;
    }
    if (Object.keys(diff).length > 0) {
      syncing.current = true;
      useOptionsStore.getState().applyPartial(diff);
      syncing.current = false;
    }
    // run once, intentionally
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) options → script: when the menu changes a syncable option, patch
  //    the script source so the .cd file reflects the new value.
  useEffect(() => {
    let prev = useOptionsStore.getState().options;
    const unsub = useOptionsStore.subscribe((state) => {
      const next = state.options;
      if (next === prev) return;

      // Find which keys changed.
      const changed: SyncableKey[] = [];
      for (const key of SYNCABLE_KEYS) {
        if (!Object.is(prev[key], next[key])) changed.push(key);
      }
      prev = next;

      if (changed.length === 0) return;
      if (syncing.current) return; // change came from script→options

      const scriptState = useScriptStore.getState();
      let patched = scriptState.source;
      for (const key of changed) {
        patched = patchSetting(patched, key, next[key], customThemesRef.current);
      }
      if (patched !== scriptState.source) {
        syncing.current = true;
        scriptState.setSource(patched);
        syncing.current = false;
      }
    });

    return unsub;
  }, []);

  // 3) script → options: when the source changes (typed in editor or via
  //    bulk preset apply), re-derive option values from the parsed Sets.
  //    Keys the script no longer mentions revert to their defaults so
  //    that commenting out / deleting a directive actually clears the
  //    option — not just adding new ones.
  useEffect(() => {
    let prev = useScriptStore.getState().source;
    const unsub = useScriptStore.subscribe((state) => {
      if (state.source === prev) return;
      prev = state.source;
      if (syncing.current) return; // change came from options→script

      const settings = extractSettings(state.source, customThemesRef.current);
      promoteInlineThemeIfAny(settings);
      const patch = buildPatchFromScript(settings);
      const current = useOptionsStore.getState().options;
      const diff: Partial<RenderOptions> = {};
      for (const [k, v] of Object.entries(patch)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!Object.is((current as any)[k], v)) (diff as any)[k] = v;
      }
      if (Object.keys(diff).length > 0) {
        syncing.current = true;
        useOptionsStore.getState().applyPartial(diff);
        syncing.current = false;
      }
    });

    return unsub;
  }, []);
};
