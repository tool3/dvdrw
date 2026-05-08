import { useState } from 'react';
import { CdEditor } from '../components/editor/CdEditor';
import { Shell } from '../components/layout/Shell';
import { Runner } from '../components/runner/Runner';
import { Card } from '../components/primitives/Card';

const SAMPLE = `# A short demo. Edit me.
Set Theme dracula
Set Title hello world
Set FontSize 18

Type "chartscii 1 2 3 4 5 -e -c 'gradient(cyan,pink)'"
Sleep 300ms
Enter
Sleep 1s
`;

export const EditorView = () => {
  const [source, setSource] = useState(SAMPLE);

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
