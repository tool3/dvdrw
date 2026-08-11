import { useEffect, useMemo, useRef, useState } from 'react';
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

/**
 * Match the same asciinema.org rewriting we do inside `CastDropZone` so
 * deep-link auto-fetches resolve to the actual `.cast` download instead
 * of the player page.
 */
const normalizeCastUrl = (raw: string): string => {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  try {
    const u = new URL(trimmed);
    if (u.hostname.endsWith('asciinema.org')) {
      const m = u.pathname.match(/^\/a\/([^./]+)\/?$/);
      if (m) {
        u.pathname = `/a/${m[1]}.cast`;
        return u.toString();
      }
    }
    return u.toString();
  } catch {
    return trimmed;
  }
};

const deriveFilename = (url: string): string => {
  try {
    const u = new URL(url);
    const tail = u.pathname.split('/').filter(Boolean).pop() ?? 'remote';
    return tail.endsWith('.cast') ? tail : `${tail}.cast`;
  } catch {
    return 'remote.cast';
  }
};

export const CastView = () => {
  const [file, setFile] = useState<CastFile | null>(null);
  const options = useOptionsStore((s) => s.options);

  // Deep-link support: `?cast=<url>` auto-fetches a remote cast on first
  // mount. Mirrors the URL-ingest UI in CastDropZone but skips the
  // typing step. Runs once per session — we strip the param after a
  // successful load so a refresh doesn't re-fetch endlessly.
  const autoLoadAttempted = useRef(false);
  useEffect(() => {
    if (autoLoadAttempted.current) return;
    if (typeof window === 'undefined') return;
    const param = new URLSearchParams(window.location.search).get('cast');
    if (!param) return;
    autoLoadAttempted.current = true;
    const target = normalizeCastUrl(param);
    (async () => {
      try {
        const res = await fetch(target, { redirect: 'follow' });
        if (!res.ok) return;
        const text = await res.text();
        if (!text.trim().startsWith('{')) return;
        setFile({ name: deriveFilename(target), content: text });
      } catch {
        // Quietly fail — the dropzone is still there for the user to
        // paste the URL manually and see the actual error message.
      }
    })();
  }, []);

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
        video={{ input, options }}
      />
    </Card>
  );

  return <Shell primary={dropCard} secondary={previewCard} split="40-60" />;
};
