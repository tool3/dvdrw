import { CdEditor } from '../components/editor/CdEditor';
import { Shell } from '../components/layout/Shell';
import { Runner } from '../components/runner/Runner';
import { Card } from '../components/primitives/Card';
import { ExamplePicker } from '../components/primitives/ExamplePicker';
import { useScriptStore } from '../stores/scriptStore';
import { useScriptOptionsSync } from '../lib/useScriptOptionsSync';
import { SCRIPT_EXAMPLES, scriptExample } from '../lib/examples';
import styles from './EditorView.module.scss';

export const EditorView = () => {
  // Bidirectional sync between the .cd source and the menu options. Sync
  // hook is mounted only here — Cast view doesn't have a script.
  useScriptOptionsSync();

  const source = useScriptStore((s) => s.source);
  const setSource = useScriptStore((s) => s.setSource);

  const editorCard = (
    <Card>
      <div className={styles.editorWrap}>
        <CdEditor value={source} onChange={setSource} />
        {/* Floated over the editor's top-right rather than given a header
            row of its own: it's an occasional escape hatch, not a section. */}
        <div className={styles.examples}>
          <ExamplePicker
            items={SCRIPT_EXAMPLES}
            onPick={(id) => {
              const example = scriptExample(id);
              if (example) setSource(example.source);
            }}
            title="Load a ready-made script"
          />
        </div>
      </div>
    </Card>
  );

  const outputCard = (
    <Card>
      <Runner source={source} />
    </Card>
  );

  return <Shell primary={editorCard} secondary={outputCard} split="40-60" />;
};
