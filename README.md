# dvdrw — web

Visual workspace for the [dvdrw](https://github.com/tool3/dvd) library: write `.cd` scripts in a syntax-highlighted editor, drop in asciinema casts, and tune the look of your animated terminal SVG with live preview.

## Stack

- Vite + React 19 + TypeScript
- SCSS modules with CSS-variable design tokens (dark by default, light alt)
- CodeMirror 6 with a custom `.cd` language and a tuned dark editor theme
- Zustand for app state
- The `dvdrw` library for SVG rendering (browser-safe primitives only)

## Develop

```bash
npm install
npm run dev
```

The dev server sets `Cross-Origin-Embedder-Policy: require-corp` and `Cross-Origin-Opener-Policy: same-origin` so a future WebContainers integration drops in without further config.

## Status

- [x] M1 — design system, dark/light themes, layout shell
- [x] M2 — script editor + live SVG preview + customization panel
- [x] M3 — asciinema cast importer
- [x] M4 — preset gallery (one-click looks)
- [ ] M5 — `.cd` scripts running in a web container (planned)

## Notes

The web app uses only the lib's pure primitives (`parseCDScript`, `parseCastFile`, `generateFramesFromRecording`, `processInput`, `coalesce`, `createFilmstripSVG`, `optimizeSvg`). The shell-running side of `CDExecutor` requires Node and is not used here — that work belongs to the planned WebContainers runner.
