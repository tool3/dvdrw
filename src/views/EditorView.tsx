import { CdEditor } from '../components/editor/CdEditor';
import { Shell } from '../components/layout/Shell';
import { Runner } from '../components/runner/Runner';
import { Card } from '../components/primitives/Card';
import { useScriptStore } from '../stores/scriptStore';
import { useScriptOptionsSync } from '../lib/useScriptOptionsSync';

export const EditorView = () => {
  // Bidirectional sync between the .cd source and the menu options. Sync
  // hook is mounted only here — Cast view doesn't have a script.
  useScriptOptionsSync();

  const source = useScriptStore((s) => s.source);
  const setSource = useScriptStore((s) => s.setSource);

  const editorCard = (
    <Card>
      <CdEditor value={source} onChange={setSource} />
    </Card>
  );

  const outputCard = (
    <Card>
      <Runner source={source} />
    </Card>
  );

  return <Shell primary={editorCard} secondary={outputCard} split="40-60" />;
};
