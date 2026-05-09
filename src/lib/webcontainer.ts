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
 * The curated set of npm CLIs preloaded inside the container so .cd scripts
 * have something interesting to demo. Every entry has a real `bin` and is
 * pure-JS or has Linux-x64 prebuilt binaries that work in WebContainer.
 */
export const PRELOADED_TOOLS: Array<{
  package: string;
  bin: string;
  describe: string;
}> = [
  { package: 'dvdrw-cli', bin: 'dvd', describe: 'the dvd CLI itself — runs your .cd files' },
  { package: 'boxen-cli', bin: 'boxen', describe: 'wraps text in box drawings (`boxen "hi"`)' },
  { package: 'chartscii-cli', bin: 'chartscii', describe: 'create beatiful ascii charts' },
  { package: 'figlet', bin: 'figlet', describe: 'big ASCII letters (`figlet hello`)' },
  { package: 'lolcatjs', bin: 'lolcatjs', describe: 'rainbow text (`lolcatjs hello`)' },
];

const PACKAGE_JSON = JSON.stringify(
  {
    name: 'dvdrw-runner',
    private: true,
    type: 'module',
    dependencies: Object.fromEntries(PRELOADED_TOOLS.map((t) => [t.package, 'latest'])),
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

export const isSupported = (): boolean => {
  if (typeof window === 'undefined') return false;
  if (!window.crossOriginIsolated) return false;
  if (typeof SharedArrayBuffer === 'undefined') return false;
  // WebContainer is Chromium-only — Safari (incl. all iOS browsers, since
  // they're WebKit under the hood) lacks the WASM/atomics pieces the
  // container runtime relies on, so cross-origin isolation alone isn't
  // enough. Bail out early so the UI shows the unsupported placeholder
  // instead of attempting a boot that will fail mid-install.
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/iPad|iPhone|iPod/i.test(ua)) return false;
  if (/^((?!chrome|android|crios|edg).)*safari/i.test(ua)) return false;
  return true;
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

const collectOutput = (
  onLog: (chunk: string) => void,
): { stream: WritableStream<string>; getText: () => string } => {
  let buffer = '';
  return {
    stream: new WritableStream<string>({
      write(chunk) {
        buffer += chunk;
        onLog(chunk);
      },
    }),
    getText: () => buffer,
  };
};

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
      onStage('installing', 'Installing the demo toolkit (one-time, takes a minute)');
      onLog(
        `installing: ${PRELOADED_TOOLS.map((t) => t.package).join(', ')}\n`,
      );
      const proc = await booted.instance.spawn('npm', [
        'install',
        '--no-fund',
        '--no-audit',
        '--loglevel=error',
      ]);
      proc.output.pipeTo(writableLog(onLog));
      const code = await proc.exit;
      if (code !== 0) {
        installPromise = null;
        throw new Error(`npm install exited with code ${code}`);
      }

      // Verify each declared bin actually resolves through `npm exec` so we
      // surface broken/missing packages clearly instead of letting the first
      // .cd run mysteriously fail with "command not found".
      onStage('verifying', 'Verifying preloaded tools');
      for (const tool of PRELOADED_TOOLS) {
        const collected = collectOutput(onLog);
        const check = await booted.instance.spawn('npm', [
          'exec',
          '--no',
          '--',
          tool.bin,
          '--help',
        ]);
        check.output.pipeTo(collected.stream);
        const checkCode = await check.exit;
        const ok = checkCode === 0 || /Usage:|usage:|Options:/i.test(collected.getText());
        onLog(`  ${ok ? '✓' : '✗'} ${tool.package} — ${tool.bin}\n`);
        if (!ok && tool.package === 'dvdrw-cli') {
          installPromise = null;
          throw new Error('dvd CLI failed to install — cannot continue.');
        }
      }

      booted.installed = true;
      onLog('toolkit installed.\n');
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
