import { type ChangeEvent, type DragEvent, useRef, useState } from 'react';
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

export const CastDropZone = ({ filename, onFile, onClear }: CastDropZoneProps) => {
  const [hover, setHover] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  return (
    <div className={styles.wrap}>
      <div className={styles.intro}>
        <h2 className={styles.heading}>Asciinema cast</h2>
        <p className={styles.sub}>Drop a .cast file here, or pick one — supports v1, v2, and v3.</p>
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
      )}

      {error && <div className={styles.error}>{error}</div>}
    </div>
  );
};
