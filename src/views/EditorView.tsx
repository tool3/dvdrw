import { useMemo, useState } from 'react';
import { CdEditor } from '../components/editor/CdEditor';
import { SvgPreview } from '../components/preview/SvgPreview';
import { OptionsPanel } from '../components/options/OptionsPanel';
import { Shell } from '../components/layout/Shell';
import { Runner } from '../components/runner/Runner';
import { useOptionsStore } from '../stores/optionsStore';
import { useAppStore } from '../stores/appStore';
import { useRender } from '../lib/useRender';
import type { RenderInput } from '../lib/render';
import { SegmentedControl } from '../components/primitives/Form';
import styles from './Views.module.scss';

const SAMPLE = `# A short demo. Edit me.
Set Theme dracula
Set Title hello world
Set FontSize 18

Type "figlet DVD -f 'ANSI Shadow' | lolcatjs"
Sleep 300ms
Enter
Sleep 600ms
Type "ls"
Sleep 200ms
Enter
Sleep 800ms
`;

export const EditorView = () => {
  const [source, setSource] = useState(SAMPLE);
  const options = useOptionsStore((s) => s.options);
  const scriptMode = useAppStore((s) => s.scriptMode);
  const setScriptMode = useAppStore((s) => s.setScriptMode);

  const input = useMemo<RenderInput>(() => ({ kind: 'script', source }), [source]);
  const { state, notices } = useRender({
    input,
    options,
    debounceMs: scriptMode === 'preview' ? 200 : 9999, // pause auto-render in run mode
  });

  const left = (
    <div className={styles.column}>
      <header className={styles.colHeader}>
        <h2 className={styles.colTitle}>Script</h2>
        <span className={styles.colHint}>.cd commands</span>
      </header>
      <CdEditor value={source} onChange={setSource} />
    </div>
  );

  const center = (
    <div className={styles.column}>
      <header className={styles.colHeader}>
        <h2 className={styles.colTitle}>Output</h2>
        <div className={styles.modeSwitch}>
          <SegmentedControl
            value={scriptMode}
            onChange={setScriptMode}
            options={[
              { label: 'Preview', value: 'preview' },
              { label: 'Run', value: 'run' },
            ]}
          />
        </div>
      </header>
      {scriptMode === 'preview' ? (
        <SvgPreview state={state} notices={notices} />
      ) : (
        <Runner source={source} />
      )}
    </div>
  );

  const right = <OptionsPanel />;

  return <Shell left={left} center={center} right={right} />;
};
