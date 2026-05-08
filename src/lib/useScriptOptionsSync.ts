import { useEffect, useRef } from 'react';
import { useScriptStore } from '../stores/scriptStore';
import { useOptionsStore, type RenderOptions } from '../stores/optionsStore';
import { useCustomThemesStore } from '../stores/customThemesStore';
import { extractSettings, patchSetting } from './scriptSync';

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
    if (Object.keys(settings).length > 0) {
      syncing.current = true;
      useOptionsStore.getState().applyPartial(settings);
      syncing.current = false;
    }
    // run once, intentionally
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) options → script: when the menu changes a syncable option, patch
  //    the script source so the .cd file reflects the new value.
  useEffect(() => {
    // Keys with a corresponding `Set X` directive in the .cd format. Other
    // optionsStore keys (engine, fps, optimize, loop, pauseAtEnd) stay
    // menu-only and never touch the script.
    type SyncableKey =
      | 'theme'
      | 'title'
      | 'watermark'
      | 'template'
      | 'fontSize'
      | 'lineHeight'
      | 'letterSpacing'
      | 'padding'
      | 'borderRadius'
      | 'borderWidth'
      | 'borderColor'
      | 'cursorStyle'
      | 'cursorBlink'
      | 'cursorColor'
      | 'background'
      | 'backgroundPadding'
      | 'backgroundRadius'
      | 'loopStyle';

    const SYNCABLE_KEYS: SyncableKey[] = [
      'theme',
      'title',
      'watermark',
      'template',
      'fontSize',
      'lineHeight',
      'letterSpacing',
      'padding',
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
    ];

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
  useEffect(() => {
    let prev = useScriptStore.getState().source;
    const unsub = useScriptStore.subscribe((state) => {
      if (state.source === prev) return;
      prev = state.source;
      if (syncing.current) return; // change came from options→script

      const settings = extractSettings(state.source, customThemesRef.current);
      const current = useOptionsStore.getState().options;
      const diff: Partial<RenderOptions> = {};
      for (const [k, v] of Object.entries(settings)) {
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
