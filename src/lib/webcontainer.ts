/**
 * WebContainer harness.
 *
 * Boots one shared instance, npm-installs dvdrw-cli + a curated demo toolkit
 * once per session, verifies the install, and exposes a single `runScript()`
 * entry point that writes the user's .cd file, runs `dvd <file>` with the
 * right flags, and returns the produced SVG bytes plus combined stdout/stderr
 * for the UI.
 *
 * Browser support: Chromium-only (Safari/Firefox lack the WebAssembly +
 * SharedArrayBuffer combo WebContainers needs). The host page must serve
 * COOP/COEP headers, which our Vite config already does.
 */

import { WebContainer, type FileSystemTree } from '@webcontainer/api';
import type { RenderOptions } from '../stores/optionsStore';
import { renderScriptAsync, type ShellExecutor } from './render';

export interface RunResult {
  svg: string;
  log: string;
  exitCode: number;
}

export interface RunInput {
  source: string;
  options: RenderOptions;
}

export type RunnerStage =
  | 'idle'
  | 'unsupported'
  | 'booting'
  | 'installing'
  | 'verifying'
  | 'ready'
  | 'running'
  | 'error';

/* ------------------------------------------------------------------------- */
/*                                 Toolkit                                   */
/* ------------------------------------------------------------------------- */

/**
 * Boot-time dependencies for the desktop path. The container installs
 * these once per session via npm and they stay resident.
 *
 * Notably absent: `dvdrw-cli`. We used to spawn it to render the SVG,
 * but the dvdrw library is already in the app bundle and rendering
 * in-page is orders of magnitude faster (no PTY emulation, no
 * child-process latency, no animation playback in the container). The
 * container is now used purely as a shell sandbox for the commands
 * users type inside their scripts.
 *
 * `chartscii-cli` is still preloaded because the default sample script
 * uses it and we want a working out-of-the-box experience on first run.
 *
 * Mobile takes a different path — see `isMobileViewport` below — and
 * installs nothing at all.
 */
const BOOT_PACKAGES = ['chartscii-cli'] as const;

/**
 * Surfaced in the runner's placeholder card so users know which demo
 * tools are quick to add. The first entry comes pre-installed; the rest
 * are opt-in via the "Add package" affordance.
 */
export const PRELOADED_TOOLS: Array<{
  package: string;
  bin: string;
  describe: string;
}> = [
  { package: 'chartscii-cli', bin: 'chartscii', describe: 'beautiful ASCII charts (installed at boot)' },
  { package: 'boxen-cli', bin: 'boxen', describe: 'wraps text in box drawings (`boxen "hi"`)' },
  { package: 'figlet', bin: 'figlet', describe: 'big ASCII letters (`figlet hello`)' },
  { package: 'lolcatjs', bin: 'lolcatjs', describe: 'rainbow text (`lolcatjs hello`)' },
];

const PACKAGE_JSON = JSON.stringify(
  {
    name: 'dvdrw-runner',
    private: true,
    type: 'module',
    dependencies: Object.fromEntries(BOOT_PACKAGES.map((p) => [p, 'latest'])),
  },
  null,
  2,
);

const SEED_TREE: FileSystemTree = {
  'package.json': { file: { contents: PACKAGE_JSON } },
  'README.md': {
    file: {
      contents:
        '# dvdrw runner\n\nThis WebContainer is a sandboxed Node.js environment used to run .cd scripts.\n',
    },
  },
};

/* ------------------------------------------------------------------------- */
/*                               Capability check                            */
/* ------------------------------------------------------------------------- */

export const isSupported = (): boolean => diagnoseSupport().ok;

/**
 * Report which capability check is missing. Used by the runner placeholder
 * so the unsupported state can be specific ("missing SharedArrayBuffer"
 * vs "page isn't cross-origin isolated") instead of a generic message —
 * mostly useful when debugging Safari behaviour where the headers may or
 * may not be reaching the iOS WebView.
 */
export const diagnoseSupport = (): {
  ok: boolean;
  reasons: string[];
} => {
  if (typeof window === 'undefined') {
    return { ok: false, reasons: ['no window (server-side)'] };
  }
  const reasons: string[] = [];
  if (!window.crossOriginIsolated) {
    reasons.push(
      'page is not cross-origin isolated (server is missing COOP/COEP headers, or a third-party iframe broke isolation)',
    );
  }
  if (typeof SharedArrayBuffer === 'undefined') {
    reasons.push('SharedArrayBuffer is unavailable in this browser');
  }
  return { ok: reasons.length === 0, reasons };
};

/* ------------------------------------------------------------------------- */
/*                                 Singleton                                 */
/* ------------------------------------------------------------------------- */

interface BootedInstance {
  instance: WebContainer;
  installed: boolean;
}

let bootPromise: Promise<BootedInstance> | null = null;
let installPromise: Promise<void> | null = null;

const writableLog = (onLog: (chunk: string) => void) =>
  new WritableStream<string>({
    write(chunk) {
      onLog(chunk);
    },
  });

const getInstance = async (
  onLog: (chunk: string) => void,
): Promise<BootedInstance> => {
  if (!bootPromise) {
    bootPromise = (async () => {
      onLog('booting webcontainer…\n');
      const instance = await WebContainer.boot();
      await instance.mount(SEED_TREE);
      onLog('booted.\n');
      return { instance, installed: false };
    })();
  }
  return bootPromise;
};

/**
 * Debug flag — when the page is loaded with `?nodeps=1` (or
 * `?debug-no-deps`), the boot path skips `npm install` entirely. Useful
 * for isolating "is the container booting at all on this device" from
 * "is npm install hanging on this device" — particularly on mobile
 * Safari where the install was failing with code 1.
 */
export const isNoDepsDebug = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.has('nodeps') || params.has('debug-no-deps');
  } catch {
    return false;
  }
};

/**
 * Mobile-shaped viewport. We use this to switch the runner into a
 * shell-only mode: the container boots with 0 deps, scripts are
 * interpreted in-page via dvdrw's library primitives, and the only
 * thing WebContainer is used for is running `bash -c "<line>"` for
 * each Type-then-Enter sequence. This dodges the OOM/quota issues that
 * full installs hit on iOS Safari while still letting users actually
 * run echo / ls / pipelines built from container shell built-ins.
 */
export const isMobileViewport = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return window.matchMedia('(max-width: 720px)').matches;
  } catch {
    return false;
  }
};

const ensureInstalled = async (
  booted: BootedInstance,
  onLog: (chunk: string) => void,
  onStage: (stage: RunnerStage, message: string) => void,
): Promise<void> => {
  if (booted.installed) return;
  if (!installPromise) {
    installPromise = (async () => {
      // Mobile path or debug ?nodeps=1: container boots, no npm runs.
      // Mobile uses the container only as a shell sandbox (for echo/ls/
      // pipelines built from busybox); the actual SVG synthesis happens
      // in-page via dvdrw, which is already in the app bundle.
      if (isNoDepsDebug() || isMobileViewport()) {
        const why = isNoDepsDebug() ? '?nodeps=1' : 'mobile viewport';
        onStage('installing', 'Skipping npm install');
        onLog(`(${why}) — npm install skipped.\n`);
        try {
          const probe = await booted.instance.spawn('node', ['--version']);
          probe.output.pipeTo(writableLog(onLog));
          const code = await probe.exit;
          onLog(`node --version exited with code ${code}.\n`);
        } catch (err) {
          onLog(`spawn failed: ${err instanceof Error ? err.message : String(err)}\n`);
        }
        booted.installed = true;
        onLog('container ready (shell-only mode).\n');
        return;
      }

      onStage('installing', `Installing ${BOOT_PACKAGES.join(', ')}`);
      onLog(`installing: ${BOOT_PACKAGES.join(', ')}\n`);
      // --no-progress avoids the carriage-return progress spinner stream
      // that some WebContainer hosts (iOS Safari especially) don't
      // flush cleanly; without it the install output streams forever
      // while npm "renders" progress, and `proc.exit` can stall.
      const proc = await booted.instance.spawn('npm', [
        'install',
        '--no-fund',
        '--no-audit',
        '--no-progress',
        '--prefer-offline',
        '--loglevel=error',
      ]);
      proc.output.pipeTo(writableLog(onLog));
      const code = await proc.exit;
      if (code !== 0) {
        installPromise = null;
        throw new Error(`npm install exited with code ${code}`);
      }

      booted.installed = true;
      onLog('toolkit ready.\n');
    })();
  }
  return installPromise;
};

/* ------------------------------------------------------------------------- */
/*                                 Run script                                */
/* ------------------------------------------------------------------------- */

export interface RunHandlers {
  onLog: (chunk: string) => void;
  onStage: (stage: RunnerStage, message: string) => void;
}

export const runScript = async (
  input: RunInput,
  handlers: RunHandlers,
): Promise<RunResult> => {
  if (!isSupported()) {
    handlers.onStage(
      'unsupported',
      'WebContainers need a Chromium-based browser with cross-origin isolation. Try Chrome, Edge, or Brave.',
    );
    throw new Error('webcontainers unsupported');
  }

  handlers.onStage('booting', 'Booting WebContainer');
  const booted = await getInstance(handlers.onLog);
  await ensureInstalled(booted, handlers.onLog, handlers.onStage);
  handlers.onStage('running', 'Running script');

  // Single render path for all platforms: walk the script in-page using
  // the dvdrw library, and use the container purely as a shell sandbox
  // for the typed-line+Enter sequences. This avoids spawning the dvd
  // CLI (slow PTY emulation + animation playback in a virtualized
  // Linux) and instead does the synthesis directly in the browser,
  // which is dramatically faster.
  const executor: ShellExecutor = {
    run: async (command) => {
      // Prepend ./node_modules/.bin to PATH so locally-installed npm
      // bins (chartscii at boot, plus anything added via "Add package")
      // are reachable as bare command names — `chartscii 1 2 3` instead
      // of `npx chartscii …`.
      const proc = await booted.instance.spawn('bash', [
        '-c',
        `export PATH=./node_modules/.bin:$PATH; ${command}`,
      ]);
      let buffer = '';
      proc.output.pipeTo(
        new WritableStream<string>({
          write(chunk) {
            buffer += chunk;
            handlers.onLog(chunk);
          },
        }),
      );
      await proc.exit;
      return buffer;
    },
  };
  const rendered = await renderScriptAsync(input.source, input.options, executor);
  handlers.onStage('ready', 'Done');
  return { svg: rendered.svg, log: '', exitCode: 0 };
};

/* ------------------------------------------------------------------------- */
/*                          Runtime dependency install                       */
/* ------------------------------------------------------------------------- */

/**
 * Install one or more npm packages into the running container. The base
 * toolkit must already be installed (we boot/install if not). Names go
 * through `npm install` verbatim, so callers can pass `pkg`, `pkg@1.2.3`,
 * scoped names, etc.
 */
export const installPackages = async (
  packages: string[],
  handlers: RunHandlers,
): Promise<void> => {
  const trimmed = packages.map((p) => p.trim()).filter(Boolean);
  if (trimmed.length === 0) return;

  if (!isSupported()) {
    handlers.onStage(
      'unsupported',
      'WebContainers need a Chromium-based browser with cross-origin isolation.',
    );
    throw new Error('webcontainers unsupported');
  }

  handlers.onStage('booting', 'Booting WebContainer');
  const booted = await getInstance(handlers.onLog);
  await ensureInstalled(booted, handlers.onLog, handlers.onStage);

  handlers.onStage('installing', `Installing ${trimmed.join(', ')}`);
  handlers.onLog(`$ npm install ${trimmed.join(' ')}\n`);
  const proc = await booted.instance.spawn('npm', [
    'install',
    '--no-fund',
    '--no-audit',
    '--loglevel=error',
    ...trimmed,
  ]);
  proc.output.pipeTo(writableLog(handlers.onLog));
  const code = await proc.exit;
  if (code !== 0) {
    handlers.onStage('error', `npm install failed (exit ${code})`);
    throw new Error(`npm install failed with code ${code}`);
  }
  handlers.onStage('ready', `Installed ${trimmed.join(', ')}`);
};

/* ------------------------------------------------------------------------- */
/*                              Pre-warm helper                              */
/* ------------------------------------------------------------------------- */

/**
 * Kick off boot + install in the background so the first Run is instant.
 * Caller decides when to invoke (e.g., when the user toggles to Run mode).
 */
export const prewarm = async (
  onLog: (chunk: string) => void,
  onStage: (stage: RunnerStage, message: string) => void,
): Promise<void> => {
  if (!isSupported()) return;
  onStage('booting', 'Booting WebContainer');
  const booted = await getInstance(onLog);
  await ensureInstalled(booted, onLog, onStage);
  onStage('ready', 'Container ready');
};
