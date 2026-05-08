import { useMemo, useState } from 'react';
import { CdEditor } from '../components/editor/CdEditor';
import { SvgPreview } from '../components/preview/SvgPreview';
import { Shell } from '../components/layout/Shell';
import { Runner } from '../components/runner/Runner';
import { Card } from '../components/primitives/Card';
import { useOptionsStore } from '../stores/optionsStore';
import { useAppStore } from '../stores/appStore';
import { useRender } from '../lib/useRender';
import type { RenderInput } from '../lib/render';
import { SegmentedControl } from '../components/primitives/Form';

const SAMPLE = `# A short demo. Edit me.
Set Theme dracula
Set Title hello world
Set FontSize 18

Type "chartscii 1 2 3 4 5 -e -c 'gradient(cyan,pink)'"
Sleep 300ms
Enter
Sleep 2
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
    debounceMs: scriptMode === 'preview' ? 200 : 9999,
  });

  const editorCard = (
    <Card>
      <CdEditor value={source} onChange={setSource} />
    </Card>
  );

  const outputCard = (
    <Card
      actions={
        <SegmentedControl
          value={scriptMode}
          onChange={setScriptMode}
          options={[
            { label: 'Preview', value: 'preview' },
            { label: 'Run', value: 'run' },
          ]}
        />
      }
    >
      {scriptMode === 'preview' ? (
        <SvgPreview state={state} notices={notices} />
      ) : (
        <Runner source={source} />
      )}
    </Card>
  );

  return <Shell primary={editorCard} secondary={outputCard} split="40-60" />;
};
