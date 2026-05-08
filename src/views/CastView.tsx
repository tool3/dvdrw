import { useMemo, useState } from 'react';
import { CastDropZone } from '../components/cast/CastDropZone';
import { SvgPreview } from '../components/preview/SvgPreview';
import { Shell } from '../components/layout/Shell';
import { Card } from '../components/primitives/Card';
import { useOptionsStore } from '../stores/optionsStore';
import { useRender } from '../lib/useRender';
import type { RenderInput } from '../lib/render';

interface CastFile {
  name: string;
  content: string;
}

export const CastView = () => {
  const [file, setFile] = useState<CastFile | null>(null);
  const options = useOptionsStore((s) => s.options);

  const input = useMemo<RenderInput | null>(
    () => (file ? { kind: 'cast', source: file.content } : null),
    [file],
  );
  const { state, notices } = useRender({ input, options });

  const dropCard = (
    <Card>
      <CastDropZone
        filename={file?.name ?? null}
        onFile={(name, content) => setFile({ name, content })}
        onClear={() => setFile(null)}
      />
    </Card>
  );

  const previewCard = (
    <Card>
      <SvgPreview
        state={state}
        notices={notices}
        filename={file ? file.name.replace(/\.cast$/, '.svg') : 'recording.svg'}
      />
    </Card>
  );

  return <Shell primary={dropCard} secondary={previewCard} split="40-60" />;
};
