# CSS Theme System — App-Wide Theming, Persistence & Editor

**Date:** 2026-04-14
**Status:** Design approved
**Scope:** Global app theme system with adapter stylesheets, persistence, and in-app picker
**Prerequisite:** Retro terminal theme system (PR #10, merged)

## Problem Statement

The app shell (tab bar, ports dashboard, chat chrome, quick launch bar) uses hardcoded dark colours throughout `index.html`. There is no way to retheme the app globally, persist a theme choice across restarts, or plug in external CSS libraries like NES.css, 98.css, system.css, or c64css3. The retro terminal themes are live but scoped to terminal instances only.

## Design Decisions

| Decision                    | Choice                                                                                     | Rationale                                                |
| --------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| Scope                       | All 5 surfaces: app shell, terminals (independent), ports, chat chrome, popped-out windows | Full visual consistency across the app                   |
| App ↔ terminal relationship | Independent — two separate theme layers                                                    | No surprise resets; terminals keep their own picker      |
| Integration model           | Adapter stylesheets — one CSS file per external theme                                      | No DOM changes; self-contained; easy to add new themes   |
| CSS foundation              | Custom properties on `:root`, adapters override via `[data-theme]`                         | Variables are overridable, persistable, editable         |
| Picker location             | Tab bar dropdown (quick switch) + settings panel (full editor, later)                      | Instant access for daily use, settings for customisation |
| Persistence                 | electron-store via existing IPC (`get-preference`/`set-preference`)                        | Already wired up in preferences.js                       |
| Adapter loading             | Dynamic `<link>` elements, swapped at runtime                                              | Hot-swappable without rebuild                            |
| External libraries          | npm packages (nes.css, 98.css, @sakun/system.css)                                          | Standard dependency management                           |
| Popped-out windows          | IPC broadcast on theme change, all windows load same adapter                               | Visual consistency across windows                        |

## Architecture

### File Structure

```
electron/
├── renderer/
│   ├── themes/                         ← NEW directory
│   │   ├── theme-loader.js             ← loads/unloads adapters, sets data-theme attr
│   │   ├── theme-registry.js           ← metadata for all app themes
│   │   ├── theme-picker.js             ← tab bar dropdown UI
│   │   ├── base.css                    ← CSS custom properties (default values)
│   │   ├── adapter-nes.css             ← imports NES.css + maps to app DOM
│   │   ├── adapter-98.css              ← imports 98.css + maps to app DOM
│   │   ├── adapter-system.css          ← imports system.css + maps to app DOM
│   │   └── adapter-c64.css             ← hand-rolled C64 chrome for app shell
│   ├── index.html                      ← MODIFIED: hardcoded colours → var() references
│   ├── terminal-themes.js              ← untouched (independent layer)
│   └── terminal-theme-ui.js            ← untouched (independent layer)
├── preferences.js                      ← MODIFIED: add appTheme to schema
├── assets/fonts/
│   ├── PressStart2P-Regular.ttf        ← copied from C:\fonts\
│   ├── C64_Pro_Mono-STYLE.woff         ← copied from C:\fonts\
│   ├── PrintChar21.woff                ← copied from C:\fonts\ (renamed)
│   ├── Web437_IBM_VGA_9x16.woff        ← already bundled
│   └── Web437_IBM_VGA_8x16.woff        ← already bundled
└── node_modules/
    ├── nes.css/                         ← npm install
    ├── 98.css/                          ← npm install
    └── @sakun/system.css/               ← npm install
```

### CSS Custom Property Surface

30 custom properties across 6 categories, defined in `base.css` on `:root`:

**Backgrounds (5)**

- `--bg-app`: #12121e — body, #app, content-area
- `--bg-surface`: #1a1a2e — tab-bar, macro-bar, panels
- `--bg-elevated`: #1f1f31 — buttons, inputs, menus
- `--bg-deep`: #171726 — toolbar, sidebar, browser pane
- `--bg-sunken`: #101018 — quick launch bar

**Foregrounds (5)**

- `--fg-primary`: #e0e0e0 — main text
- `--fg-secondary`: #b4b4c3 — descriptions, meta
- `--fg-muted`: #888 — inactive tabs, hints
- `--fg-dim`: #666 — close buttons, placeholders
- `--fg-faint`: #555 — status text, disabled

**Accents (5)**

- `--accent`: #da7756 — active tab, hover, focus
- `--accent-hover-bg`: rgba(218,119,86,0.1) — button hover background
- `--accent-subtle`: rgba(218,119,86,0.15) — table row hover
- `--accent-danger`: #ff6b6b — kill button, errors
- `--accent-success`: #4ade80 — browse button, connected

**Borders (3)**

- `--border`: #2a2a3a — standard border
- `--border-strong`: #3a3a4a — popover, emphasis
- `--border-grid`: #2a2a3a — grid layout lines

**Typography (3)**

- `--font-ui`: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif — app UI font
- `--font-mono`: Consolas, "Courier New", monospace — code, ports, status
- `--font-size-base`: 13px — base font size

**Shadows & Chrome (6)**

- `--shadow-menu`: 0 4px 12px rgba(0,0,0,0.4) — dropdown menus
- `--shadow-float`: 0 5px 25px rgba(0,0,0,0.3) — floating windows
- `--radius`: 4px — standard border-radius
- `--radius-lg`: 6px — buttons, inputs
- `--radius-xl`: 10px — ports table wrap
- `--color-scheme`: dark — CSS color-scheme property

### Adapter Stylesheet Structure

Each adapter is a standalone CSS file with two responsibilities:

1. **Import the external library** (if applicable)
2. **Override CSS custom properties** under `:root[data-theme="<id>"]`
3. **Component-specific overrides** scoped to `[data-theme="<id>"]` where variables alone aren't sufficient (e.g. NES pixel borders, 98.css bevel shadows)

Example:

```css
/* adapter-nes.css */
@import "../../node_modules/nes.css/css/nes.min.css";

@font-face {
  font-family: "Press Start 2P";
  src: url("../../assets/fonts/PressStart2P-Regular.ttf") format("truetype");
}

:root[data-theme="nes"] {
  --bg-app: #212529;
  --bg-surface: #212529;
  --bg-elevated: #2a2e33;
  --accent: #e76e55;
  --font-ui: "Press Start 2P", monospace;
  --font-size-base: 10px;
  --radius: 0;
  --radius-lg: 0;
  --radius-xl: 0;
  --color-scheme: dark;
}

/* NES pixel border pattern on buttons */
[data-theme="nes"] .macro-btn {
  box-shadow:
    inset -4px -4px 0 #adafbc,
    inset 4px 4px 0 #adafbc;
  image-rendering: pixelated;
}
```

### Theme Registry

`theme-registry.js` exports an array of theme metadata objects:

```javascript
const APP_THEMES = [
  {
    id: "default",
    name: "Default",
    era: null,
    adapter: null, // uses base.css only, no adapter
    font: null, // system font
    preview: {
      // for settings panel thumbnail
      bg: "#12121e",
      fg: "#e0e0e0",
      accent: "#da7756",
    },
  },
  {
    id: "nes",
    name: "NES",
    era: "8-bit",
    adapter: "adapter-nes.css",
    font: { family: "Press Start 2P", file: "PressStart2P-Regular.ttf" },
    preview: { bg: "#212529", fg: "#fff", accent: "#e76e55" },
  },
  {
    id: "win98",
    name: "Windows 98",
    era: "1998",
    adapter: "adapter-98.css",
    font: null, // bundled with 98.css
    preview: { bg: "#008080", fg: "#000", accent: "#000080" },
  },
  {
    id: "system6",
    name: "System 6",
    era: "1988",
    adapter: "adapter-system.css",
    font: null, // bundled with system.css
    preview: { bg: "#fff", fg: "#000", accent: "#000" },
  },
  {
    id: "c64",
    name: "Commodore 64",
    era: "1982",
    adapter: "adapter-c64.css",
    font: { family: "C64_Pro_Mono", file: "C64_Pro_Mono-STYLE.woff" },
    preview: { bg: "#352879", fg: "#6C5EB5", accent: "#6C5EB5" },
  },
];
```

### Theme Loader

`theme-loader.js` manages the runtime theme lifecycle:

```javascript
// Public API
applyTheme(themeId); // sets data-theme, swaps <link>, persists
getCurrentTheme(); // returns current theme id
getThemeRegistry(); // returns APP_THEMES array
```

**applyTheme flow:**

1. Look up theme in registry
2. Set `document.documentElement.dataset.theme = themeId`
3. Remove existing adapter `<link id="theme-adapter">`
4. If theme has an adapter, create new `<link>` with `href` pointing to the adapter CSS
5. Load theme font via FontFace API if needed
6. Persist via IPC: `set-preference('appTheme', themeId)`
7. Broadcast to other windows via IPC: `ipcRenderer.send('theme-changed', themeId)`

**On app launch:**

1. `renderer.js` calls `get-preference('appTheme')` — returns stored id or `'default'`
2. Calls `applyTheme(storedId)`

### Theme Picker UI

**Tab bar dropdown** (built in `theme-picker.js`):

- `<select>` element positioned right-side of the tab bar, before window control padding
- Styled with app theme variables so it self-themes
- `change` event calls `applyTheme(value)`

**Settings panel** (future layer, not this session):

- Dedicated "Appearance" tab with theme preview grid
- Colour override sliders
- Save as custom theme
- Import/export JSON

### Persistence Schema

Extend `preferences.js` schema:

```javascript
appTheme: {
  type: 'string',
  default: 'default',
},
```

### Popped-Out Window Sync

Main process listens for `theme-changed` IPC event and broadcasts to all BrowserWindows:

```javascript
ipcMain.on("theme-changed", (event, themeId) => {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (win.webContents !== event.sender) {
      win.webContents.send("theme-changed", themeId);
    }
  });
});
```

Each renderer listens for `theme-changed` and calls `applyTheme()`.

### Font Bundling

| Font           | Source                                                                  | Destination                                      | Used By                      |
| -------------- | ----------------------------------------------------------------------- | ------------------------------------------------ | ---------------------------- |
| Press Start 2P | `C:\fonts\Press_Start_2P\PressStart2P-Regular.ttf`                      | `electron/assets/fonts/PressStart2P-Regular.ttf` | NES adapter                  |
| C64 Pro Mono   | `C:\fonts\C64_TrueType_v1.2.1-STYLE\...\C64_Pro_Mono-STYLE.woff`        | `electron/assets/fonts/C64_Pro_Mono-STYLE.woff`  | C64 adapter + terminal theme |
| PrintChar21    | `C:\fonts\OnlineWebFonts_COM_...\Print Char 21\Web Fonts\5752cf...woff` | `electron/assets/fonts/PrintChar21.woff`         | Apple IIe terminal theme     |

98.css and system.css bundle their own fonts in their npm packages — no action needed.

### index.html Migration

All hardcoded colour values in the `<style>` block are replaced with `var()` references. The `base.css` file is loaded as the first stylesheet, defining default values. Example:

```css
/* Before */
.tab-bar {
  background: #1a1a2e;
  border-bottom: 1px solid #2a2a3a;
}

/* After */
.tab-bar {
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
}
```

The `<link rel="stylesheet" href="./themes/base.css">` is added to `<head>` before the existing `<style>` block.

## Theme Adapter Catalogue

### Default

- Variables only (defined in base.css) — no adapter file
- Current dark palette preserved exactly

### NES.css (8-bit Pixel)

- npm: `nes.css`
- Font: Press Start 2P (bundled TTF)
- Colours: dark background (#212529), bright pixel accents
- Chrome: pixelated borders (no border-radius), chunky box-shadows
- Font size reduced (Press Start 2P is large)

### 98.css (Windows 98)

- npm: `98.css`
- Font: Pixelated MS Sans Serif (bundled in library)
- Colours: #c0c0c0 grey chrome, #008080 teal desktop, #000080 navy title bars
- Chrome: 3D bevel borders (inset box-shadows), no border-radius
- color-scheme: light

### system.css (Classic Mac System 6)

- npm: `@sakun/system.css`
- Font: Chicago / Chicago_12 (bundled in library)
- Colours: black & white, 1-bit aesthetic
- Chrome: solid black borders, rounded buttons, dotted patterns
- color-scheme: light

### C64 (Commodore 64)

- No npm package — hand-rolled adapter
- Font: C64 Pro Mono (bundled WOFF)
- Colours: #352879 blue bg, #6C5EB5 light blue fg/accent
- Chrome: PETSCII-inspired borders, uppercase text, pixel button style

## Out of Scope

- Colour override editor / custom theme creation (future settings panel layer)
- Import/export themes as JSON
- Theming the chat webview content (hosted at 127.0.0.1:8300 — we can only style the wrapper)
- Sound effects
- Additional adapters (XP.css, TuiCss, Arwes, cyberpunk) — can be added later as individual adapter files

## Acceptance Criteria

- [ ] CSS custom properties extracted from all hardcoded colours in index.html
- [ ] base.css defines default theme values; index.html uses var() references throughout
- [ ] Default theme looks identical to current app (zero visual regression)
- [ ] 4 adapter stylesheets work: NES, 98, system, C64
- [ ] Theme loader dynamically swaps adapters at runtime
- [ ] Tab bar theme dropdown allows switching between all 5 themes
- [ ] Theme choice persisted via electron-store, restored on app launch
- [ ] Popped-out windows receive theme changes via IPC broadcast
- [ ] Ports dashboard fully themed (table, search, filters, badges, buttons)
- [ ] Chat chrome (webview border, browser pane header) fully themed
- [ ] App shell (tab bar, content area backgrounds) fully themed
- [ ] Quick launch bar themed via app theme variables
- [ ] Terminal chrome (toolbar, macro bar backgrounds) picks up app theme variables — terminal xterm content and per-terminal theme picker remain independent
- [ ] Fonts bundled: Press Start 2P, C64 Pro Mono, PrintChar21
- [ ] No regressions in existing terminal theme system
- [ ] Each adapter is self-contained — removing it doesn't break anything else
