import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PRELOADED_TOOLS,
  diagnoseSupport,
  installPackages,
  isSupported,
  prewarm,
  runScript,
  type RunnerStage,
} from '../../lib/webcontainer';
import { useOptionsStore, type RenderOptions } from '../../stores/optionsStore';
import { useAppStore } from '../../stores/appStore';
import { Button } from '../primitives/Button';
import { TextInput } from '../primitives/Form';
import { ZoomControls } from '../primitives/ZoomControls';
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

const DownloadIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
    <path
      d="M6 1.5v6.5M3 5.5L6 8.5L9 5.5M2 10.5h8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/* Lightweight ring spinner. Uses currentColor so it inherits whatever the
   parent's text color is — green during run, accent during boot. */
const Spinner = ({ size = 32 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    className={styles.spinnerSvg}
    aria-hidden
  >
    <circle
      cx="16"
      cy="16"
      r="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeDasharray="44 36"
      opacity="0.85"
    />
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

const BOOT_STAGES = new Set<RunnerStage>([
  'booting',
  'installing',
  'verifying',
]);

export const Runner = ({ source, filename = 'output.svg' }: RunnerProps) => {
  const options = useOptionsStore((s) => s.options);
  const autoRun = useAppStore((s) => s.autoRun);
  const toggleAutoRun = useAppStore((s) => s.toggleAutoRun);

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
  // Console panel starts collapsed on narrow viewports — most of the time
  // the user wants to see the rendered SVG, not the build log. They can
  // expand it via the header chip.
  const [consoleOpen, setConsoleOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(min-width: 961px)').matches;
  });

  const logRef = useRef<HTMLPreElement | null>(null);
  const debounceRef = useRef<number | null>(null);
  const pendingRef = useRef(false); // a re-run is requested while the current run is in flight
  const runFnRef = useRef<() => Promise<void>>(async () => {});
  const sourceRef = useRef(source);
  const optionsRef = useRef<RenderOptions>(options);
  const hasRunOnceRef = useRef(false);
  const autoRunRef = useRef(autoRun);

  sourceRef.current = source;
  optionsRef.current = options;
  hasRunOnceRef.current = hasRunOnce;
  autoRunRef.current = autoRun;

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

  // Auto-rerun on source/options changes — only if the user hasn't switched
  // the chip to Manual. The autoRun ref is read inside the closure so flipping
  // the toggle off mid-edit interrupts a pending debounce.
  useEffect(() => {
    if (!hasRunOnceRef.current) return;
    if (!supported) return;
    if (!autoRunRef.current) return;

    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
    }
    setAutoQueued(true);

    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null;
      // Re-check at fire time — the user could have flipped to Manual
      // during the debounce window.
      if (!autoRunRef.current) {
        setAutoQueued(false);
        return;
      }
      runFnRef.current();
    }, AUTO_RERUN_DELAY_MS);

    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [source, options, supported]);

  // Switching to Manual mid-debounce should also clear the queued indicator.
  useEffect(() => {
    if (!autoRun && debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
      setAutoQueued(false);
    }
  }, [autoRun]);

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

  // Status chip — three states share the same physical chip so the user's
  // eye doesn't have to move between affordances.
  //   • Running (green): a run is in flight; chip is read-only.
  //   • Auto (accent):   re-runs are scheduled on edit; click → Manual.
  //   • Manual (orange): edits don't trigger runs; click → Auto.
  // Booting/installing/verifying counts as Running so the chip mirrors the
  // boot spinner's state.
  const isBooting = BOOT_STAGES.has(stage);
  const chipKind = running || isBooting ? 'running' : autoRun ? 'auto' : 'manual';
  const chipLabel = chipKind === 'running' ? 'Running' : chipKind === 'auto' ? 'Auto' : 'Manual';
  const chipDisabled = chipKind === 'running' || !supported || !hasRunOnce;

  const status = autoQueued && !running ? 'Auto-run queued…' : message;

  // Centered boot/run spinner shown in the stage when there's no rendered
  // SVG yet — gives the user something to watch during the multi-second
  // first boot + npm install.
  const stageSpinner = (() => {
    if (dataUrl) return null;
    if (running) {
      return { tone: 'running' as const, label: status };
    }
    if (isBooting) {
      return { tone: 'booting' as const, label: status };
    }
    return null;
  })();

  return (
    <div className={styles.wrap}>
      <header className={styles.toolbar}>
        <div className={styles.status}>
          <span className={[styles.dot, styles[`dot_${stage}`]].join(' ')} aria-hidden />
          <span className={styles.statusText}>{status}</span>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={[styles.modeChip, styles[`modeChip_${chipKind}`]]
              .filter(Boolean)
              .join(' ')}
            onClick={() => {
              if (chipKind === 'running') return;
              toggleAutoRun();
            }}
            disabled={chipDisabled}
            aria-label={
              chipKind === 'running'
                ? 'Currently running'
                : chipKind === 'auto'
                  ? 'Auto-rerun is on. Click to switch to manual.'
                  : 'Manual mode. Click to switch to auto-rerun.'
            }
            title={
              chipKind === 'running'
                ? 'A run is in flight'
                : chipKind === 'auto'
                  ? 'Auto: re-runs on every edit. Click for Manual.'
                  : 'Manual: edits don’t trigger runs. Click for Auto.'
            }
          >
            <span className={styles.modeChipDot} aria-hidden />
            {chipLabel}
          </button>

          <ZoomControls zoom={zoom} onChange={setZoom} disabled={!svg} />

          <Button
            size="sm"
            variant="ghost"
            iconLeft={<PlusIcon />}
            disabled={!supported || installing}
            onClick={() => setShowAddDep((v) => !v)}
            title="Install an additional npm package into the container"
            aria-label="Add package"
            mobileIconOnly
          >
            Add package
          </Button>
          <Button
            size="sm"
            variant="primary"
            iconLeft={<RunIcon />}
            disabled={!supported || running || !source.trim()}
            onClick={performRun}
            title={running ? 'Running…' : hasRunOnce ? 'Re-run script' : 'Run script'}
            aria-label={running ? 'Running' : hasRunOnce ? 'Re-run' : 'Run'}
            mobileIconOnly
          >
            {running ? 'Running…' : hasRunOnce ? 'Re-run' : 'Run'}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            iconLeft={<DownloadIcon />}
            disabled={!svg}
            onClick={() => svg && downloadBlob(svg, filename, 'image/svg+xml')}
            title="Download SVG"
            aria-label="Download SVG"
            mobileIconOnly
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
            <div className={styles.frame} style={{ zoom }}>
              <img
                className={styles.image}
                src={dataUrl}
                alt="container output"
                draggable={false}
              />
            </div>
          ) : stageSpinner ? (
            <div
              className={[styles.bootSpinner, styles[`bootSpinner_${stageSpinner.tone}`]]
                .filter(Boolean)
                .join(' ')}
              role="status"
              aria-live="polite"
            >
              <Spinner size={36} />
              <span className={styles.bootSpinnerLabel}>{stageSpinner.label}</span>
              <span className={styles.bootSpinnerSub}>
                {stageSpinner.tone === 'booting'
                  ? 'First boot can take a minute while the toolkit installs.'
                  : 'Streaming output from the container.'}
              </span>
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
                  Container can't boot in this browser:
                  <ul>
                    {diagnoseSupport().reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                  Modern Chrome / Edge / Brave / Arc and Safari 16.4+ should
                  work. Editing themes and options still works here.
                </p>
              )}
            </div>
          )}
        </div>

        <section
          className={[
            styles.consoleSection,
            consoleOpen ? styles.consoleSectionOpen : styles.consoleSectionClosed,
          ].join(' ')}
        >
          <button
            type="button"
            className={styles.consoleToggle}
            onClick={() => setConsoleOpen((v) => !v)}
            aria-expanded={consoleOpen}
            aria-controls="runner-console"
          >
            <svg
              className={[
                styles.consoleToggleChevron,
                consoleOpen ? styles.consoleToggleChevronOpen : '',
              ]
                .filter(Boolean)
                .join(' ')}
              width="10"
              height="10"
              viewBox="0 0 10 10"
              aria-hidden
            >
              <path
                d="M2 3.5l3 3 3-3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className={styles.consoleToggleLabel}>Container output</span>
            {!consoleOpen && !isLogEmpty && (
              <span className={styles.consoleToggleBadge} aria-hidden />
            )}
          </button>
          {consoleOpen && (
            <pre id="runner-console" ref={logRef} className={styles.console}>
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
          )}
        </section>
      </div>
    </div>
  );
};
