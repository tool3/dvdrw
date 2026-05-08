import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The dvdrw library has a single barrel export that transitively imports
 * `node:child_process`, `node:fs`, etc. from its CDExecutor's shell handler.
 * The web app never goes through that code path (we only use parsing,
 * vterminal, and SVG primitives), but Rollup still tries to resolve named
 * imports from those builtins. We stub them with no-op modules so the bundle
 * builds cleanly. The unused code paths get tree-shaken; any slipthrough
 * would only fail at call time, which we never trigger.
 */
const stubNodeBuiltins = (): Plugin => {
  const STUB_PREFIX = '\0stub-node:';
  const STUB_BODY = `
    const noop = () => undefined;
    const proxy = new Proxy(noop, {
      get(target, prop) {
        if (prop === '__esModule' || prop === 'default') return target;
        return proxy;
      },
      apply() { return undefined; },
      construct() { return Object.create(null); },
    });
    export default proxy;
    export const spawn = proxy;
    export const exec = proxy;
    export const execSync = proxy;
    export const fork = proxy;
    export const StringDecoder = class { write() { return ''; } end() { return ''; } };
    export const readFile = proxy;
    export const writeFile = proxy;
    export const readFileSync = () => '';
    export const writeFileSync = noop;
    export const existsSync = () => false;
    export const mkdir = proxy;
    export const mkdirSync = noop;
    export const rm = proxy;
    export const rmSync = noop;
    export const join = (...parts) => parts.join('/');
    export const resolve = (...parts) => parts.join('/');
    export const dirname = (p) => String(p).split('/').slice(0, -1).join('/');
    export const basename = (p) => String(p).split('/').pop();
    export const extname = (p) => {
      const s = String(p);
      const i = s.lastIndexOf('.');
      return i < 0 ? '' : s.slice(i);
    };
    export const platform = 'browser';
    export const cwd = () => '/';
    export const env = {};
    export const tmpdir = () => '/tmp';
    export const homedir = () => '/';
  `;

  return {
    name: 'stub-node-builtins',
    enforce: 'pre',
    resolveId(id) {
      if (id.startsWith('node:')) return STUB_PREFIX + id;
      return null;
    },
    load(id) {
      if (id.startsWith(STUB_PREFIX)) return STUB_BODY;
      return null;
    },
  };
};

export default defineConfig({
  plugins: [react(), stubNodeBuiltins()],
  css: {
    modules: {
      localsConvention: 'camelCase',
      generateScopedName: '[name]__[local]___[hash:base64:5]',
    },
  },
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
});
