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
 * Boot-time dependency — only `dvdrw-cli` is installed upfront because
 * it's the runtime that interprets the .cd file. Larger demo tools used
 * to be preloaded here, but on resource-constrained WebViews (iOS Safari
 * especially) the multi-package install would either hang or stretch
 * for many minutes; users can opt-in via the "Add package" UI in the
 * runner toolbar instead. Showing them in the placeholder card lets the
 * user know they exist without paying their install cost on every boot.
 */
const BOOT_PACKAGE = 'dvdrw-cli';

/**
 * Surfaced in the runner's placeholder card so users know which demo
 * tools are quick to add. None of these are installed at boot time —
 * use the "Add package" affordance.
 */
export const PRELOADED_TOOLS: Array<{
  package: string;
  bin: string;
  describe: string;
}> = [
  { package: 'dvdrw-cli', bin: 'dvd', describe: 'the dvd CLI itself — runs your .cd files (installed at boot)' },
  { package: 'boxen-cli', bin: 'boxen', describe: 'wraps text in box drawings (`boxen "hi"`)' },
  { package: 'chartscii-cli', bin: 'chartscii', describe: 'beautiful ASCII charts' },
  { package: 'figlet', bin: 'figlet', describe: 'big ASCII letters (`figlet hello`)' },
  { package: 'lolcatjs', bin: 'lolcatjs', describe: 'rainbow text (`lolcatjs hello`)' },
];

const PACKAGE_JSON = JSON.stringify(
  {
    name: 'dvdrw-runner',
    private: true,
    type: 'module',
    dependencies: { [BOOT_PACKAGE]: 'latest' },
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

const ensureInstalled = async (
  booted: BootedInstance,
  onLog: (chunk: string) => void,
  onStage: (stage: RunnerStage, message: string) => void,
): Promise<void> => {
  if (booted.installed) return;
  if (!installPromise) {
    installPromise = (async () => {
      onStage('installing', `Installing ${BOOT_PACKAGE}`);
      onLog(`installing: ${BOOT_PACKAGE}\n`);
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
/*                              Options → flags                               */
/* ------------------------------------------------------------------------- */

const optionsToFlags = (opts: RenderOptions): string[] => {
  const flags: string[] = [];
  const push = (flag: string, value: string | number | boolean | undefined) => {
    if (value === undefined || value === '' || value === null) return;
    if (typeof value === 'boolean') {
      if (value) flags.push(flag);
      else flags.push(`--no-${flag.replace(/^--/, '')}`);
      return;
    }
    flags.push(flag, String(value));
  };

  // Custom themes (id like "custom-1234") aren't in dvd-cli's --theme
  // choices list and would be rejected. The script's `Set Theme {json}`
  // directive — written by the bidirectional menu↔script sync — handles
  // those at runtime instead.
  if (opts.theme && !opts.theme.startsWith('custom-')) {
    push('--theme', opts.theme);
  }
  push('--template', opts.template);
  push('--font-size', opts.fontSize);
  push('--line-height', opts.lineHeight);
  push('--padding', opts.padding);
  push('--border-radius', opts.borderRadius);
  if (opts.borderWidth > 0) push('--border-width', opts.borderWidth);
  if (opts.borderColor) push('--border-color', opts.borderColor);
  if (opts.title) push('--title', opts.title);
  if (opts.watermark) push('--watermark', opts.watermark);
  push('--cursor-style', opts.cursorStyle);
  if (!opts.cursorBlink) flags.push('--no-cursor-blink');
  if (opts.cursorColor) push('--cursor-color', opts.cursorColor);
  if (opts.background) push('--background', opts.background);
  if (opts.backgroundPadding > 0) push('--background-padding', opts.backgroundPadding);
  if (opts.backgroundRadius > 0) push('--background-radius', opts.backgroundRadius);
  if (opts.fps) push('--fps', opts.fps);
  if (!opts.loop) flags.push('--no-loop');
  push('--loop-style', opts.loopStyle);
  push('--pause-at-end', opts.pauseAtEnd);
  if (opts.letterSpacing) push('--letter-spacing', opts.letterSpacing);
  if (opts.engine === 'smil') flags.push('--smil');
  if (!opts.optimize) flags.push('--no-optimize');

  return flags;
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

  const inputPath = 'input.cd';
  const outputPath = 'output.svg';
  // dvd-cli has no global "hide cursor" flag for script renders. We fake
  // it by prefixing the script with a Hide/Show block that prints the
  // DECTCEM-off escape (`\e[?25l`); the terminal state stays "cursor
  // hidden" for the rest of the capture. The wrapper itself isn't recorded
  // because it lives between Hide and Show.
  const sourceForRun = input.options.cursorVisible
    ? input.source
    : [
        'Hide',
        `Type "printf '\\033[?25l'"`,
        'Enter',
        'Sleep 50ms',
        'Show',
        '',
        input.source,
      ].join('\n');
  await booted.instance.fs.writeFile(inputPath, sourceForRun);

  const flags = optionsToFlags(input.options);
  // `npm exec` runs a local bin and inherits PATH so dvd's bash subshells
  // also find chalk/boxen/figlet/cowsay/lolcatjs.
  const args = ['exec', '--no', '--', 'dvd', inputPath, '-o', outputPath, ...flags];
  handlers.onLog(`$ npm ${args.join(' ')}\n`);

  const proc = await booted.instance.spawn('npm', args);
  proc.output.pipeTo(writableLog(handlers.onLog));

  const exitCode = await proc.exit;
  if (exitCode !== 0) {
    handlers.onStage('error', `Script failed (exit ${exitCode})`);
    throw new Error(`dvd exited with code ${exitCode}`);
  }

  const svg = await booted.instance.fs.readFile(outputPath, 'utf-8');
  handlers.onStage('ready', 'Done');
  return { svg, log: '', exitCode };
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
