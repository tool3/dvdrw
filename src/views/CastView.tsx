import { useMemo, useState } from 'react';
import { CastDropZone } from '../components/cast/CastDropZone';
import { SvgPreview } from '../components/preview/SvgPreview';
import { OptionsPanel } from '../components/options/OptionsPanel';
import { Shell } from '../components/layout/Shell';
import { useOptionsStore } from '../stores/optionsStore';
import { useRender } from '../lib/useRender';
import type { RenderInput } from '../lib/render';
import styles from './Views.module.scss';

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

  const left = (
    <div className={styles.column}>
      <header className={styles.colHeader}>
        <h2 className={styles.colTitle}>Recording</h2>
        <span className={styles.colHint}>.cast file</span>
      </header>
      <CastDropZone
        filename={file?.name ?? null}
        onFile={(name, content) => setFile({ name, content })}
        onClear={() => setFile(null)}
      />
    </div>
  );

  const center = (
    <SvgPreview
      state={state}
      notices={notices}
      filename={file ? file.name.replace(/\.cast$/, '.svg') : 'recording.svg'}
    />
  );
  const right = <OptionsPanel />;

  return <Shell left={left} center={center} right={right} />;
};
