import {
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  useRef,
  useState,
} from 'react';
import styles from './CastDropZone.module.scss';
import { Button } from '../primitives/Button';

interface CastDropZoneProps {
  filename: string | null;
  onFile: (filename: string, content: string) => void;
  onClear: () => void;
}

const FileIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
    <path
      d="M5 2h6l4 4v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
    <path d="M11 2v4h4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
  </svg>
);

const UploadIcon = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden>
    <path
      d="M16 22V8M16 8L10 14M16 8L22 14M6 24V26C6 27.66 7.34 29 9 29H23C24.66 29 26 27.66 26 26V24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const LinkIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
    <path
      d="M6 4H3.5a2 2 0 0 0 0 4H6M8 4h2.5a2 2 0 0 1 0 4H8M4.5 6h5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * Asciinema's web page (`/a/<id>`) and its cast download (`/a/<id>.cast`)
 * are different URLs. Users often paste the former; we transparently
 * rewrite to the latter so the fetch lands on the actual JSON. Other
 * hosts pass through unchanged.
 */
const normalizeCastUrl = (raw: string): string => {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  try {
    const u = new URL(trimmed);
    if (u.hostname.endsWith('asciinema.org')) {
      // /a/<id> or /a/<id>/ → /a/<id>.cast
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

/**
 * Asciinema cast ingestion surface.
 *
 * Three input paths land in the same `onFile` handler:
 *   1. Drag-and-drop of a local file onto the dropzone.
 *   2. Click-to-browse via the hidden `<input type="file">`.
 *   3. Pasting a URL into the "From a URL" form below the dropzone —
 *      we fetch it, sniff for asciinema.org's `/a/<id>` shorthand and
 *      rewrite to the `.cast` download path automatically.
 */
export const CastDropZone = ({ filename, onFile, onClear }: CastDropZoneProps) => {
  const [hover, setHover] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [fetching, setFetching] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const ingest = async (file: File) => {
    setError(null);
    if (!file.name.endsWith('.cast') && file.size > 4 * 1024 * 1024) {
      setError('That doesn’t look like a .cast file (and it’s big). Skipping.');
      return;
    }
    try {
      const text = await file.text();
      onFile(file.name, text);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read file');
    }
  };

  const ingestFromUrl = async (raw: string) => {
    setError(null);
    const target = normalizeCastUrl(raw);
    if (!target) return;
    setFetching(true);
    try {
      const response = await fetch(target, { redirect: 'follow' });
      if (!response.ok) {
        throw new Error(
          `Couldn’t fetch (${response.status} ${response.statusText || 'error'}).`,
        );
      }
      const text = await response.text();
      // Minimal sanity check: an asciinema cast is either a JSON header
      // object on line 1 (v2/v3) or a JSON object/array (v1). All forms
      // start with `{`.
      if (!text.trim().startsWith('{')) {
        throw new Error('Response doesn’t look like an asciinema cast.');
      }
      onFile(deriveFilename(target), text);
      setUrl('');
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      // Most failure paths on CORS-blocked hosts surface as "Failed to
      // fetch" with no further info; spell it out so the user knows the
      // server (not us) needs to set CORS headers.
      const isCors = /failed to fetch/i.test(detail);
      setError(
        isCors
          ? 'Couldn’t fetch — the host probably doesn’t allow cross-origin downloads. Try saving the file locally and dropping it instead.'
          : detail,
      );
    } finally {
      setFetching(false);
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setHover(false);
    const file = e.dataTransfer.files[0];
    if (file) ingest(file);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) ingest(file);
    e.target.value = '';
  };

  const handleUrlSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!url.trim() || fetching) return;
    ingestFromUrl(url);
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.intro}>
        <h2 className={styles.heading}>Asciinema cast</h2>
        <p className={styles.sub}>Drop a .cast file, pick one, or paste a URL — supports v1, v2, and v3.</p>
      </div>

      {filename ? (
        <div className={styles.fileCard}>
          <span className={styles.fileIcon}>
            <FileIcon />
          </span>
          <div className={styles.fileMeta}>
            <span className={styles.fileName}>{filename}</span>
            <span className={styles.fileLabel}>Loaded</span>
          </div>
          <Button variant="ghost" size="sm" onClick={onClear}>
            Replace
          </Button>
        </div>
      ) : (
        <>
          <button
            type="button"
            className={[styles.dropzone, hover ? styles.dropzoneHover : ''].filter(Boolean).join(' ')}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setHover(true);
            }}
            onDragLeave={() => setHover(false)}
            onDrop={handleDrop}
          >
            <span className={styles.dropIcon}>
              <UploadIcon />
            </span>
            <span className={styles.dropTitle}>Drop a .cast file</span>
            <span className={styles.dropSub}>or click to browse</span>
            <input
              ref={inputRef}
              type="file"
              accept=".cast,application/json"
              className={styles.fileInput}
              onChange={handleChange}
            />
          </button>

          <div className={styles.divider}>
            <span>or paste a URL</span>
          </div>

          <form className={styles.urlForm} onSubmit={handleUrlSubmit}>
            <span className={styles.urlIcon} aria-hidden>
              <LinkIcon />
            </span>
            <input
              type="url"
              className={styles.urlInput}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://asciinema.org/a/…  or any .cast URL"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              disabled={fetching}
            />
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={!url.trim() || fetching}
            >
              {fetching ? 'Fetching…' : 'Fetch'}
            </Button>
          </form>
        </>
      )}

      {error && <div className={styles.error}>{error}</div>}
    </div>
  );
};
