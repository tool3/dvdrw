<p align="center">
  <img src="https://raw.githubusercontent.com/tool3/dvd-cli/master/examples/svgs/branding/intro_original.svg" alt="dvdrw — animated terminal SVGs in the browser" width="800">
</p>

<h1 align="center">dvdrw · web</h1>

<p align="center">
  <strong>The visual workspace for animated terminal recordings.</strong><br>
  Write a <code>.cd</code> script, <em>actually run it</em> in a sandboxed Node container, and watch the animated SVG build itself — then export SVG or MP4.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/dvdrw"><img src="https://img.shields.io/npm/v/dvdrw?color=cb3837&label=dvdrw" alt="dvdrw on npm"></a>
  <a href="https://www.npmjs.com/package/dvdrw-cli"><img src="https://img.shields.io/npm/v/dvdrw-cli?color=cb3837&label=dvdrw-cli" alt="dvdrw-cli on npm"></a>
  <img src="https://img.shields.io/badge/react-19-149eca?logo=react&logoColor=white" alt="react 19">
  <img src="https://img.shields.io/badge/vite-6-646cff?logo=vite&logoColor=white" alt="vite 6">
</p>

<p align="center">
  <a href="#what-this-is">What this is</a> ·
  <a href="#the-runner">The runner</a> ·
  <a href="#two-ways-in">Two ways in</a> ·
  <a href="#exporting">Exporting</a> ·
  <a href="#making-it-yours">Customising</a> ·
  <a href="#running-it-locally">Local dev</a> ·
  <a href="#the-dvd-family">The family</a>
</p>

---

## What this is

[`dvd`](https://github.com/tool3/dvd-cli) turns terminal sessions into animated SVGs. It's a CLI, and a CLI is a great way to *produce* a recording — but a poor way to *design* one. Every tweak to a colour, a font size, or the pause before a command means editing a file, re-running, and reopening the output.

This app closes that loop. The script, the settings, and the result are all on screen at once, and the result updates as you type.

The important part: **this is not a mockup of the output**. The preview is rendered by the same `dvdrw` primitives the CLI calls — the same parser, the same virtual terminal, the same SVG emitter. What you see is what `dvd` writes.

---

## The runner

The headline feature, and the thing that makes this more than a styling panel: **your script really runs**.

Press **Run** and the page boots a full Node.js environment in a WebContainer, executes each `Type` + `Enter` line in a real shell, and feeds the captured stdout — escape codes and all — through the virtual terminal into the animation. Colours, spinners, progress bars and in-place redraws all survive, because nothing is being faked.

```
Type "chartscii 3 5 8 2 -e"
Enter
```

That runs `chartscii` for real, animation and all, and the redraw frames land in the SVG at the speed they actually arrived.

**Preinstalled:** [`chartscii-cli`](https://www.npmjs.com/package/chartscii-cli) — beautiful ASCII charts, ready on first run.

**One click away** via *Add package* — anything on npm. `boxen-cli`, `figlet` and `lolcatjs` are good places to start.

After the first run, edits re-run automatically. The **Auto / Manual** chip in the toolbar turns that off when you'd rather drive it yourself, and the collapsible **Container output** panel shows the raw stream so you can see exactly what your command printed.

---

## Two ways in

### Script

A CodeMirror 6 editor with a purpose-built `.cd` language mode — commands, durations, settings and strings all highlighted, in the app's own theme. Typing, keystrokes, shortcuts, sleeps and every `Set` directive behave exactly as they do in the CLI; the four file-oriented directives are the only exceptions ([see below](#limitations)). Full [syntax reference](https://github.com/tool3/dvd-cli#syntax-reference) in the CLI README.

### Cast

Already have an [asciinema](https://asciinema.org) recording? Drop the `.cast` file in, pick it from a dialog, or paste a URL — **v1, v2 and v3** are all supported. asciinema's `/a/<id>` page links are recognised and rewritten to the raw cast automatically, so you can paste straight from the address bar.

Deep-link it too:

```
?cast=https://asciinema.org/a/683979
```

Loads and renders on arrival — handy for docs, issues, and sharing a look with someone.

---

## Exporting

| Format | What you get |
| ------ | ------------ |
| **SVG** | The real artifact — resolution-independent, real text, tiny after gzip. Drop it in a README. |
| **MP4** | H.264 for the places SVG can't go: social previews, slide decks, Slack. |

SVG export is instant and works in any browser. MP4 encodes in-page with WebCodecs and offers three tiers:

| Tier | Detail |
| ---- | ------ |
| **Low** | Smallest file, quickest export |
| **Medium** | Matches the SVG pixel for pixel |
| **High** | 3× supersampled — as crisp as the SVG, even zoomed |

Terminal output is thin, high-contrast glyph edges, which is the hardest case for a video codec. `High` renders the vector at triple size and lets the player downscale, which is what makes text read as sharply as the SVG rather than as smeared video.

> Video is generated from the same frame data as the SVG — each frame is re-rendered as a still and encoded. It is not a screen recording, and nothing is captured in real time.

---

## Making it yours

- **37 built-in themes** — Dracula, Tokyo Night, Catppuccin Mocha, Gruvbox, Nord, Solarized, Synthwave '84 and the rest.
- **A custom theme editor** — build a full 16-colour palette, name it, keep it. Stored locally and available anywhere a theme is.
- **6 one-click presets** — Midnight, Aurora, Sunset, Paper, Bare, Panel.
- **Window** — macOS, Windows or minimal chrome; title, watermark, corner radius, borders.
- **Type** — font size, line height, letter spacing.
- **Frame** — explicit width/height or auto-fit, padding.
- **Cursor** — block, bar or underline; colour, blink, visibility.
- **Backdrop** — a solid colour or a multi-stop gradient behind the window, with its own padding and radius.
- **Animation** — playback speed, FPS, loop style (loop, reverse, rewind, fade), pause at end, loop pause, and the choice of filmstrip or SMIL engine.
- **Brand colour** — retints the whole UI, including the favicon.

### The panel and the script are the same thing

The settings panel isn't a separate layer of state — it's **bidirectionally bound to your `.cd` source**. Change the theme in the menu and a `Set Theme dracula` line appears in the script. Type that line yourself and the menu moves to match. The file stays the source of truth, which is what makes the result portable: what you design here is a script, not a project file, and it renders identically from the CLI.

A handful of options are menu-only because the `.cd` format has no directive for them — `engine`, `fps`, `optimize`, `loop` and `pauseAtEnd`. Those are render-time flags; pass them to the CLI as arguments instead.

---

## Browser support

|  | Editing & preview | Cast import | SVG export | Runner | MP4 export |
| --- | :---: | :---: | :---: | :---: | :---: |
| Chrome / Edge / Brave / Arc | ✅ | ✅ | ✅ | ✅ | ✅ |
| Safari | ✅ | ✅ | ✅ | — | if supported |
| Firefox | ✅ | ✅ | ✅ | — | if supported |

The **runner** needs WebContainers: a Chromium engine plus a cross-origin-isolated page (`SharedArrayBuffer` + COOP/COEP). **MP4 export** needs WebCodecs — reliably present in Chromium, and detected at runtime elsewhere rather than assumed.

Neither feature fails loudly. Both check for what they need and hide themselves if it's missing, so every other part of the app works in every browser.

On phones the runner switches to a **shell-only mode**: the container boots with no npm install so it fits in memory, shell built-ins still work, and the SVG is synthesised in-page.

---

## Running it locally

```bash
npm install
npm run dev
```

```bash
npm run build      # tsc -b && vite build
npm run preview    # serve the production build
```

The dev server sets the two headers WebContainers require:

```
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Opener-Policy:   same-origin
```

`vercel.json` sets the same pair for production, so a Vercel deploy needs no extra configuration. On any other host, send those headers or the runner won't boot.

**Query parameters**

| Param | Effect |
| ----- | ------ |
| `?cast=<url>` | Fetch and render a cast on load |
| `?nodeps=1` | Boot the container without `npm install` — for isolating boot problems from install problems |

---

## How it works

The `dvdrw` library has a Node-only side: `CDExecutor`'s shell handler imports `node:child_process`, which cannot exist in a browser bundle. So the app never calls the high-level `dvd()` API. It walks the script itself using only the pure primitives — `parseCDScript`, `createGridState`, `processInput`, `coalesce`, `createFilmstripSVG`, `emitAnimated`, `planVideo` — and uses the WebContainer purely as a shell sandbox for lines the script types.

That split is what makes the runner fast: no PTY emulation, no child-process round-trips, no animation played back in a virtualised Linux. Commands run in the container; frames are built in the page.

A few details worth knowing:

- **Cast rendering runs in a Web Worker** with a two-tier cache. Replaying a large cast through the virtual terminal is the slow step and is theme-independent, so grid snapshots are cached by source; colouring them into themed spans is cached by source + theme. Changing a colour re-coalesces; it doesn't re-replay.
- **Shell animations are reconstructed.** A command that redraws in place (`chartscii -e`, spinners, `lolcat`) sends its frames as one concatenated stream. The app detects the rewind dialect — cursor-up, terminal-reset or cursor-restore — splits the stream back into frames, and times them against the command's real duration.
- **Video is planned in the library, encoded in the page.** `planVideo` resamples frames onto a constant rate and emits one static SVG per frame; the page rasterises those to a canvas and encodes with WebCodecs. The CLI does the identical thing with resvg and ffmpeg — same plan, different backend.

**Stack:** Vite 6 · React 19 · TypeScript · SCSS modules over CSS-variable tokens · CodeMirror 6 · Zustand · `@webcontainer/api` · `mp4-muxer`

---

## The dvd family

| | | |
| --- | --- | --- |
| **[dvdrw](https://github.com/tool3/dvd)** | The library. Parser, virtual terminal, SVG emitters, video planning. | [npm](https://www.npmjs.com/package/dvdrw) |
| **[dvdrw-cli](https://github.com/tool3/dvd-cli)** | The `dvd` command. Scripts, pipes, live recording, SVG + MP4/WebM/GIF. | [npm](https://www.npmjs.com/package/dvdrw-cli) |
| **[dvdrw · web](https://github.com/tool3/dvdrw)** | This app. Design the recording, then take the `.cd` file anywhere. | — |

Everything you build here is a plain `.cd` script. Copy it out, commit it, and render it in CI:

```bash
npx dvdrw-cli demo.cd -o demo.svg
npx dvdrw-cli demo.cd -o demo.mp4 -q high
```

Same parser, same emitter, same result.

---

## Limitations

- `Output`, `Source`, `Screenshot` and `Require` are script directives aimed at the CLI. The app notes them and moves on.
- Very long recordings are limited by DOM size and browser memory rather than file size — the SVG stacks every frame. Trim the recording or lower the FPS if a preview starts to crawl.
- The runner's container is ephemeral. Packages added with *Add package* live until you reload.
