import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PRELOADED_TOOLS,
  installPackages,
  isSupported,
  prewarm,
  runScript,
  type RunnerStage,
} from '../../lib/webcontainer';
import { useOptionsStore, type RenderOptions } from '../../stores/optionsStore';
import { Button } from '../primitives/Button';
import { TextInput } from '../primitives/Form';
import { TerminalBuffer, cellsToSpans } from '../../lib/terminal';
import { styleToCss } from '../../lib/ansi';
import styles from './Runner.module.scss';

const CONSOLE_FG = '#c8c8c8';
const CONSOLE_BG = '#050505';

interface RunnerProps {
  source: string;
  filename?: string;
}

const DEFAULT_MESSAGES: Record<RunnerStage, string> = {
  idle: 'Click Run to execute the script in a sandboxed Node container.',
  unsupported: 'WebContainers need a Chromium browser with cross-origin isolation.',
  booting: 'Booting WebContainer…',
  installing: 'Installing the demo toolkit…',
  verifying: 'Verifying preloaded tools…',
  ready: 'Done',
  running: 'Running script…',
  error: 'Run failed',
};

const RunIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
    <path d="M3 2L10 6L3 10Z" fill="currentColor" />
  </svg>
);

const PlusIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
    <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const ZoomInIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
    <path d="M6 3v6M3 6h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const ZoomOutIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
    <path d="M3 6h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const downloadBlob = (text: string, filename: string, mime: string) => {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const AUTO_RERUN_DELAY_MS = 800;

// Discrete zoom stops users can click through. Spans 0.25x → 4x with the
// 100% stop in the middle so the reset button has a natural target.
const ZOOM_STOPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

const nearestZoomStep = (current: number, direction: 1 | -1): number => {
  if (direction > 0) {
    const next = ZOOM_STOPS.find((s) => s > current + 0.001);
    return next ?? ZOOM_STOPS[ZOOM_STOPS.length - 1];
  }
  const lower = [...ZOOM_STOPS].reverse().find((s) => s < current - 0.001);
  return lower ?? ZOOM_STOPS[0];
};

export const Runner = ({ source, filename = 'output.svg' }: RunnerProps) => {
  const options = useOptionsStore((s) => s.options);
  const [stage, setStage] = useState<RunnerStage>('idle');
  const [message, setMessage] = useState(DEFAULT_MESSAGES.idle);
  const bufferRef = useRef<TerminalBuffer>(new TerminalBuffer());
  const [logTick, setLogTick] = useState(0);
  const [svg, setSvg] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [hasRunOnce, setHasRunOnce] = useState(false);
  const [autoQueued, setAutoQueued] = useState(false);
  const [extras, setExtras] = useState<string[]>([]);
  const [showAddDep, setShowAddDep] = useState(false);
  const [depDraft, setDepDraft] = useState('');
  const [installing, setInstalling] = useState(false);
  const [zoom, setZoom] = useState(1);

  const logRef = useRef<HTMLPreElement | null>(null);
  const debounceRef = useRef<number | null>(null);
  const pendingRef = useRef(false); // a re-run is requested while the current run is in flight
  const runFnRef = useRef<() => Promise<void>>(async () => {});
  const sourceRef = useRef(source);
  const optionsRef = useRef<RenderOptions>(options);
  const hasRunOnceRef = useRef(false);

  sourceRef.current = source;
  optionsRef.current = options;
  hasRunOnceRef.current = hasRunOnce;

  const supported = useMemo(() => isSupported(), []);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logTick]);

  const appendLog = useCallback((chunk: string) => {
    bufferRef.current.write(chunk);
    setLogTick((t) => t + 1);
  }, []);

  const resetLog = useCallback(() => {
    bufferRef.current.reset();
    setLogTick((t) => t + 1);
  }, []);

  const handleStage = useCallback((next: RunnerStage, msg: string) => {
    setStage(next);
    setMessage(msg);
  }, []);

  // Pre-warm container on first render so the first Run skips boot/install latency.
  useEffect(() => {
    if (!supported) {
      setStage('unsupported');
      setMessage(DEFAULT_MESSAGES.unsupported);
      return;
    }
    let cancelled = false;
    prewarm(
      (chunk) => {
        if (!cancelled) appendLog(chunk);
      },
      (next, msg) => {
        if (!cancelled) handleStage(next, msg);
      },
    ).catch((err) => {
      if (cancelled) return;
      const detail = err instanceof Error ? err.message : String(err);
      appendLog(`prewarm failed: ${detail}\n`);
      handleStage('error', 'Prewarm failed — Run will retry');
    });
    return () => {
      cancelled = true;
    };
  }, [supported, appendLog, handleStage]);

  const performRun = useCallback(async () => {
    if (!supported) return;
    if (running) {
      pendingRef.current = true;
      setAutoQueued(true);
      return;
    }
    setRunning(true);
    setAutoQueued(false);
    setSvg((prev) => prev); // keep previous result visible during the run
    resetLog();
    try {
      const result = await runScript(
        { source: sourceRef.current, options: optionsRef.current },
        { onLog: appendLog, onStage: handleStage },
      );
      setSvg(result.svg);
      if (!hasRunOnceRef.current) setHasRunOnce(true);
    } catch {
      // stage already updated to 'error' inside runScript
    } finally {
      setRunning(false);
      if (pendingRef.current) {
        pendingRef.current = false;
        // Yield a frame so React commits the running=false state, then re-run.
        setTimeout(() => runFnRef.current(), 0);
      }
    }
  }, [supported, running, appendLog, handleStage, resetLog]);

  runFnRef.current = performRun;

  // Once the user has triggered the first run, treat subsequent edits as a
  // signal to re-render. We watch source and options changes (NOT hasRunOnce
  // — that flip alone shouldn't trigger a re-run) and gate via the ref.
  useEffect(() => {
    if (!hasRunOnceRef.current) return;
    if (!supported) return;

    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
    }
    setAutoQueued(true);

    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null;
      runFnRef.current();
    }, AUTO_RERUN_DELAY_MS);

    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [source, options, supported]);

  const dataUrl = useMemo(() => {
    if (!svg) return null;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }, [svg]);

  const lines = useMemo(() => {
    void logTick;
    return bufferRef.current.getLines().map((cells) => cellsToSpans(cells));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logTick]);

  const isLogEmpty = bufferRef.current.isEmpty();

  const submitDep = useCallback(async () => {
    const name = depDraft.trim();
    if (!name || installing) return;
    setInstalling(true);
    try {
      await installPackages([name], { onLog: appendLog, onStage: handleStage });
      setExtras((prev) => (prev.includes(name) ? prev : [...prev, name]));
      setDepDraft('');
      setShowAddDep(false);
    } catch {
      // stage was already set to 'error' inside installPackages
    } finally {
      setInstalling(false);
    }
  }, [depDraft, installing, appendLog, handleStage]);

  const showAutoBadge = hasRunOnce && supported;
  const status = autoQueued && !running ? 'Auto-run queued…' : message;

  return (
    <div className={styles.wrap}>
      <header className={styles.toolbar}>
        <div className={styles.status}>
          <span className={[styles.dot, styles[`dot_${stage}`]].join(' ')} aria-hidden />
          <span className={styles.statusText}>{status}</span>
          {showAutoBadge && <span className={styles.autoBadge}>auto</span>}
        </div>
        <div className={styles.actions}>
          <div className={styles.zoomGroup} role="group" aria-label="Preview zoom">
            <button
              type="button"
              className={styles.zoomBtn}
              disabled={!svg || zoom <= ZOOM_STOPS[0]}
              onClick={() => setZoom((z) => nearestZoomStep(z, -1))}
              aria-label="Zoom out"
              title="Zoom out"
            >
              <ZoomOutIcon />
            </button>
            <button
              type="button"
              className={styles.zoomLevel}
              disabled={!svg}
              onClick={() => setZoom(1)}
              aria-label={`Reset zoom to 100% (currently ${Math.round(zoom * 100)}%)`}
              title="Reset to 100%"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              className={styles.zoomBtn}
              disabled={!svg || zoom >= ZOOM_STOPS[ZOOM_STOPS.length - 1]}
              onClick={() => setZoom((z) => nearestZoomStep(z, 1))}
              aria-label="Zoom in"
              title="Zoom in"
            >
              <ZoomInIcon />
            </button>
          </div>

          <Button
            size="sm"
            variant="ghost"
            iconLeft={<PlusIcon />}
            disabled={!supported || installing}
            onClick={() => setShowAddDep((v) => !v)}
            title="Install an additional npm package into the container"
          >
            Add package
          </Button>
          <Button
            size="sm"
            variant="primary"
            iconLeft={<RunIcon />}
            disabled={!supported || running || !source.trim()}
            onClick={performRun}
          >
            {running ? 'Running…' : hasRunOnce ? 'Re-run' : 'Run'}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={!svg}
            onClick={() => svg && downloadBlob(svg, filename, 'image/svg+xml')}
          >
            Download SVG
          </Button>
        </div>
      </header>

      {showAddDep && (
        <div className={styles.depBar}>
          <TextInput
            value={depDraft}
            onChange={setDepDraft}
            placeholder="npm package (e.g. gradient-string)"
          />
          <Button
            size="sm"
            variant="primary"
            disabled={!depDraft.trim() || installing}
            onClick={submitDep}
          >
            {installing ? 'Installing…' : 'Install'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setShowAddDep(false);
              setDepDraft('');
            }}
            disabled={installing}
          >
            Cancel
          </Button>
        </div>
      )}

      {extras.length > 0 && (
        <div className={styles.extraChips}>
          <span className={styles.extraChipsLabel}>Added</span>
          {extras.map((name) => (
            <code key={name} className={styles.extraChip}>
              {name}
            </code>
          ))}
        </div>
      )}

      <div className={styles.body}>
        <div className={styles.stage}>
          {dataUrl ? (
            <div
              className={styles.frame}
              /* `zoom` (vs. transform: scale) drives layout too, so the
                  stage's overflow:auto can scroll naturally when zoomed
                  past the viewport. Chromium-only — but WebContainers
                  already requires Chromium. */
              style={{ zoom }}
            >
              <img className={styles.image} src={dataUrl} alt="container output" draggable={false} />
            </div>
          ) : (
            <div className={styles.placeholderCard}>
              <div className={styles.placeholderHead}>
                <h3 className={styles.placeholderTitle}>Sandboxed run</h3>
                <p className={styles.placeholderSub}>
                  Press Run to execute your .cd file in a real Node.js container.
                  After the first run, edits to the script auto-rerun the container.
                </p>
              </div>

              <div className={styles.toolList}>
                <span className={styles.toolHead}>Pre-installed</span>
                <ul>
                  {PRELOADED_TOOLS.map((t) => (
                    <li key={t.package}>
                      <code>{t.bin}</code>
                      <span>{t.describe}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {!supported && (
                <p className={styles.warn}>
                  Your browser doesn’t support WebContainers. Open this page in
                  Chrome, Edge, or Brave with cross-origin isolation.
                </p>
              )}
            </div>
          )}
        </div>

        <pre ref={logRef} className={styles.console}>
          {isLogEmpty ? (
            <span className={styles.consoleHint}>// container output will appear here</span>
          ) : (
            lines.map((spans, lineIdx) => (
              <div key={lineIdx} className={styles.consoleLine}>
                {spans.length === 0 ? (
                  '​'
                ) : (
                  spans.map((span, i) => (
                    <span key={i} style={styleToCss(span.style, CONSOLE_FG, CONSOLE_BG)}>
                      {span.text}
                    </span>
                  ))
                )}
              </div>
            ))
          )}
        </pre>
      </div>
    </div>
  );
};
