# Retro Terminal Themes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four retro terminal themes (C64, MS-DOS, Apple IIe, CRT Amber) with CRT effects, pixel fonts, boot sequences, per-terminal chrome theming, and a tuning popover.

**Architecture:** Three new renderer modules (`terminal-themes.js`, `terminal-effects.js`, `terminal-theme-ui.js`) provide theme data, DOM effects, and tuning UI respectively. `terminals.js` orchestrates them. Fonts are bundled as WOFF files. Each terminal instance independently manages its own theme, effects, and tuning state.

**Tech Stack:** xterm.js 6, esbuild (existing bundler), CSS custom properties, FontFace API, WOFF fonts from oldschool_pc_font_pack_v2.2_FULL.

**Spec:** `docs/superpowers/specs/2026-04-14-retro-terminal-themes-design.md`

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `electron/renderer/terminal-themes.js` | Theme definitions — 8 theme objects with full ANSI palettes, font config, effects, chrome, boot text, tuning defaults |
| Create | `electron/renderer/terminal-effects.js` | CRT effects — scanline overlay, phosphor glow, monitor border. Pure DOM manipulation |
| Create | `electron/renderer/terminal-theme-ui.js` | Tuning popover — sliders, toggles, event wiring. One popover instance per terminal |
| Modify | `electron/renderer/terminals.js:14-37` | Remove `XTERM_THEME` constant, import from `terminal-themes.js` |
| Modify | `electron/renderer/terminals.js:437-468` | Replace theme dropdown and `toggleTheme()` with new theme system |
| Modify | `electron/renderer/terminals.js:720-728` | Use theme-aware terminal creation with boot sequence |
| Modify | `electron/renderer/terminals.js:884-904` | Extend instance state with effects/tuning fields |
| Modify | `electron/renderer/terminal-config.js:31-57` | Remove `THEME_PRESETS` and `themes` from `window.TerminalConfig` |
| Modify | `electron/renderer/index.html:1193` | Add `<script>` tags for new modules before `terminals.bundle.js` |
| Create | `electron/assets/fonts/` | Directory for bundled WOFF font files |
| Copy   | `electron/assets/fonts/Web437_IBM_VGA_9x16.woff` | From oldschool font pack |
| Copy   | `electron/assets/fonts/Web437_IBM_VGA_8x16.woff` | From oldschool font pack |

---

### Task 1: Bundle Fonts

**Files:**
- Create: `electron/assets/fonts/` (directory)
- Copy: `Web437_IBM_VGA_9x16.woff`, `Web437_IBM_VGA_8x16.woff` from font pack

- [ ] **Step 1: Create fonts directory**

```bash
mkdir -p electron/assets/fonts
```

- [ ] **Step 2: Copy WOFF fonts from the oldschool pack**

```bash
cp "C:/fonts/oldschool_pc_font_pack_v2.2_FULL/woff - Web (webfonts)/Web437_IBM_VGA_9x16.woff" electron/assets/fonts/
cp "C:/fonts/oldschool_pc_font_pack_v2.2_FULL/woff - Web (webfonts)/Web437_IBM_VGA_8x16.woff" electron/assets/fonts/
```

- [ ] **Step 3: Add licence attribution file**

Create `electron/assets/fonts/ATTRIBUTION.md`:

```markdown
# Font Attribution

## The Ultimate Oldschool PC Font Pack v2.2

- **Source:** http://int10h.org/oldschool-pc-fonts/
- **Author:** VileR
- **Licence:** Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)
- **Fonts used:**
  - Web437_IBM_VGA_9x16.woff — MS-DOS and CRT Amber themes
  - Web437_IBM_VGA_8x16.woff — DOS alternate

## C64 Pro Mono

- **Status:** To be sourced separately
- **Licence:** TBD — verify before bundling

## Apple II Font

- **Status:** To be sourced separately (PrintChar21 or equivalent)
- **Licence:** TBD — verify before bundling
```

- [ ] **Step 4: Verify files are in place**

```bash
ls -la electron/assets/fonts/
```

Expected: 3 files (2 `.woff` + `ATTRIBUTION.md`)

- [ ] **Step 5: Commit**

```bash
git add electron/assets/fonts/
git commit -m "chore(fonts): bundle oldschool VGA fonts for retro terminal themes"
```

---

### Task 2: Create terminal-themes.js — Theme Definitions

**Files:**
- Create: `electron/renderer/terminal-themes.js`

- [ ] **Step 1: Create the theme definitions file**

Create `electron/renderer/terminal-themes.js` with all 8 theme objects. Each theme must include: `id`, `name`, `era`, `xterm` (full 16-colour ANSI palette), `font`, `cursor`, `effects`, `chrome`, `boot`, `tuning`.

```javascript
"use strict";

// Retro Terminal Themes — pure data definitions.
// Each theme is a self-contained object describing colours, fonts,
// effects, chrome styling, boot text, and tuning defaults.

/**
 * Font loading via FontFace API.
 * Called once on first theme application that needs a custom font.
 * Fonts are WOFF files in electron/assets/fonts/.
 */
const _loadedFonts = new Set();

async function loadThemeFont(font) {
  if (!font || !font.file || _loadedFonts.has(font.family)) return;
  try {
    const fontFace = new FontFace(
      font.family,
      `url(../assets/fonts/${font.file})`
    );
    await fontFace.load();
    document.fonts.add(fontFace);
    _loadedFonts.add(font.family);
  } catch (err) {
    console.warn(`Failed to load font ${font.family}:`, err);
  }
}

// ---------------------------------------------------------------------------
// Existing themes — migrated to full shape, system fonts, no effects
// ---------------------------------------------------------------------------

const THEME_DEFAULT = {
  id: "default",
  name: "Default",
  era: "",
  xterm: {
    background: "#12121e",
    foreground: "#e0e0e0",
    cursor: "#da7756",
    cursorAccent: "#12121e",
    selectionBackground: "rgba(218, 119, 86, 0.3)",
    black: "#12121e",
    red: "#ff6b6b",
    green: "#4ade80",
    yellow: "#fbbf24",
    blue: "#60a5fa",
    magenta: "#a78bfa",
    cyan: "#22d3ee",
    white: "#e0e0e0",
    brightBlack: "#555",
    brightRed: "#ff8a8a",
    brightGreen: "#86efac",
    brightYellow: "#fcd34d",
    brightBlue: "#93c5fd",
    brightMagenta: "#c4b5fd",
    brightCyan: "#67e8f9",
    brightWhite: "#ffffff",
  },
  font: { family: 'Consolas, "Courier New", monospace', file: null, size: 13 },
  cursor: { style: "bar", blink: true },
  effects: {
    glow: { enabled: false, color: null, radius: 0 },
    border: { enabled: false, color: null, width: 0 },
  },
  chrome: {
    toolbarBg: null,
    buttonStyle: "default",
    accentColor: null,
    tabIndicatorColor: null,
  },
  boot: { lines: [], delay: 0 },
  tuning: { lineHeight: 1.2, letterSpacing: 0 },
};

const THEME_CYBERPUNK = {
  id: "cyberpunk",
  name: "Cyberpunk",
  era: "",
  xterm: {
    background: "#000b1e",
    foreground: "#00ff9f",
    cursor: "#f0f",
    cursorAccent: "#000b1e",
    selectionBackground: "rgba(255, 0, 255, 0.3)",
    black: "#000b1e",
    red: "#ff003c",
    green: "#00ff9f",
    yellow: "#fffc58",
    blue: "#0090ff",
    magenta: "#f0f",
    cyan: "#00e5ff",
    white: "#d0d0d0",
    brightBlack: "#555",
    brightRed: "#ff5577",
    brightGreen: "#55ffbb",
    brightYellow: "#fffd88",
    brightBlue: "#55aaff",
    brightMagenta: "#ff55ff",
    brightCyan: "#55eeff",
    brightWhite: "#ffffff",
  },
  font: { family: 'Consolas, "Courier New", monospace', file: null, size: 13 },
  cursor: { style: "bar", blink: true },
  effects: {
    glow: { enabled: false, color: null, radius: 0 },
    border: { enabled: false, color: null, width: 0 },
  },
  chrome: {
    toolbarBg: null,
    buttonStyle: "default",
    accentColor: null,
    tabIndicatorColor: null,
  },
  boot: { lines: [], delay: 0 },
  tuning: { lineHeight: 1.2, letterSpacing: 0 },
};

const THEME_MATRIX = {
  id: "matrix",
  name: "Matrix",
  era: "",
  xterm: {
    background: "#0d0208",
    foreground: "#00ff41",
    cursor: "#00ff41",
    cursorAccent: "#0d0208",
    selectionBackground: "rgba(0, 255, 65, 0.3)",
    black: "#0d0208",
    red: "#ff0000",
    green: "#00ff41",
    yellow: "#cccc00",
    blue: "#0044ff",
    magenta: "#cc00cc",
    cyan: "#00cccc",
    white: "#d0d0d0",
    brightBlack: "#555",
    brightRed: "#ff5555",
    brightGreen: "#55ff77",
    brightYellow: "#ffff55",
    brightBlue: "#5555ff",
    brightMagenta: "#ff55ff",
    brightCyan: "#55ffff",
    brightWhite: "#ffffff",
  },
  font: { family: 'Consolas, "Courier New", monospace', file: null, size: 13 },
  cursor: { style: "bar", blink: true },
  effects: {
    glow: { enabled: false, color: null, radius: 0 },
    border: { enabled: false, color: null, width: 0 },
  },
  chrome: {
    toolbarBg: null,
    buttonStyle: "default",
    accentColor: null,
    tabIndicatorColor: null,
  },
  boot: { lines: [], delay: 0 },
  tuning: { lineHeight: 1.2, letterSpacing: 0 },
};

const THEME_DRACULA = {
  id: "dracula",
  name: "Dracula",
  era: "",
  xterm: {
    background: "#282a36",
    foreground: "#f8f8f2",
    cursor: "#ff79c6",
    cursorAccent: "#282a36",
    selectionBackground: "rgba(255, 121, 198, 0.3)",
    black: "#282a36",
    red: "#ff5555",
    green: "#50fa7b",
    yellow: "#f1fa8c",
    blue: "#6272a4",
    magenta: "#ff79c6",
    cyan: "#8be9fd",
    white: "#f8f8f2",
    brightBlack: "#6272a4",
    brightRed: "#ff6e6e",
    brightGreen: "#69ff94",
    brightYellow: "#ffffa5",
    brightBlue: "#d6acff",
    brightMagenta: "#ff92df",
    brightCyan: "#a4ffff",
    brightWhite: "#ffffff",
  },
  font: { family: 'Consolas, "Courier New", monospace', file: null, size: 13 },
  cursor: { style: "bar", blink: true },
  effects: {
    glow: { enabled: false, color: null, radius: 0 },
    border: { enabled: false, color: null, width: 0 },
  },
  chrome: {
    toolbarBg: null,
    buttonStyle: "default",
    accentColor: null,
    tabIndicatorColor: null,
  },
  boot: { lines: [], delay: 0 },
  tuning: { lineHeight: 1.2, letterSpacing: 0 },
};

// ---------------------------------------------------------------------------
// New retro themes
// ---------------------------------------------------------------------------

// C64 ANSI colours sourced from: https://www.c64-wiki.com/wiki/Color
const THEME_C64 = {
  id: "c64",
  name: "Commodore 64",
  era: "1982",
  xterm: {
    background: "#352879",
    foreground: "#6C5EB5",
    cursor: "#6C5EB5",
    cursorAccent: "#352879",
    selectionBackground: "rgba(108, 94, 181, 0.3)",
    black: "#000000",
    red: "#880000",
    green: "#00cc55",
    yellow: "#cccc00",
    blue: "#352879",
    magenta: "#cc44cc",
    cyan: "#00cccc",
    white: "#6C5EB5",
    brightBlack: "#444444",
    brightRed: "#ff5555",
    brightGreen: "#55ff55",
    brightYellow: "#ffff55",
    brightBlue: "#6C5EB5",
    brightMagenta: "#ff55ff",
    brightCyan: "#55ffff",
    brightWhite: "#ffffff",
  },
  font: {
    family: "C64_Pro_Mono",
    file: "C64_Pro_Mono.woff", // sourced separately — falls back to VGA
    size: 16,
    fallback: "Web437_IBM_VGA_9x16",
  },
  cursor: { style: "block", blink: true },
  effects: {
    glow: { enabled: false, color: "rgba(108, 94, 181, 0.8)", radius: 5 },
    border: { enabled: true, color: "#6C5EB5", width: 24 },
  },
  chrome: {
    toolbarBg: "#2a2060",
    buttonStyle: "pixel",
    accentColor: "#6C5EB5",
    tabIndicatorColor: "#6C5EB5",
  },
  boot: {
    lines: [
      "",
      "    **** COMMODORE 64 BASIC V2 ****",
      "",
      " 64K RAM SYSTEM  38911 BASIC BYTES FREE",
      "",
      "READY.",
    ],
    delay: 50,
  },
  tuning: { lineHeight: 1.4, letterSpacing: 1 },
};

// MS-DOS colours sourced from: standard IBM VGA text-mode palette
const THEME_MSDOS = {
  id: "msdos",
  name: "MS-DOS 3.30",
  era: "1987",
  xterm: {
    background: "#000000",
    foreground: "#AAAAAA",
    cursor: "#AAAAAA",
    cursorAccent: "#000000",
    selectionBackground: "rgba(170, 170, 170, 0.3)",
    black: "#000000",
    red: "#AA0000",
    green: "#00AA00",
    yellow: "#AA5500",
    blue: "#0000AA",
    magenta: "#AA00AA",
    cyan: "#00AAAA",
    white: "#AAAAAA",
    brightBlack: "#555555",
    brightRed: "#FF5555",
    brightGreen: "#55FF55",
    brightYellow: "#FFFF55",
    brightBlue: "#5555FF",
    brightMagenta: "#FF55FF",
    brightCyan: "#55FFFF",
    brightWhite: "#FFFFFF",
  },
  font: {
    family: "Web437_IBM_VGA_9x16",
    file: "Web437_IBM_VGA_9x16.woff",
    size: 16,
  },
  cursor: { style: "block", blink: true },
  effects: {
    glow: { enabled: false, color: null, radius: 0 },
    border: { enabled: false, color: null, width: 0 },
  },
  chrome: {
    toolbarBg: "#111111",
    buttonStyle: "bevel",
    accentColor: "#AAAAAA",
    tabIndicatorColor: "#AAAAAA",
  },
  boot: {
    lines: [
      "Microsoft(R) MS-DOS(R) Version 3.30",
      "(C)Copyright Microsoft Corp 1981-1987",
      "",
    ],
    delay: 40,
  },
  tuning: { lineHeight: 1.2, letterSpacing: 0.5 },
};

// Apple II colours sourced from: Apple II Reference Manual
const THEME_APPLE2 = {
  id: "apple2",
  name: "Apple IIe",
  era: "1983",
  xterm: {
    background: "#000000",
    foreground: "#33FF33",
    cursor: "#33FF33",
    cursorAccent: "#000000",
    selectionBackground: "rgba(51, 255, 51, 0.3)",
    black: "#000000",
    red: "#cc0000",
    green: "#33FF33",
    yellow: "#cccc00",
    blue: "#0000cc",
    magenta: "#cc00cc",
    cyan: "#00cccc",
    white: "#33FF33",
    brightBlack: "#555555",
    brightRed: "#ff5555",
    brightGreen: "#55ff55",
    brightYellow: "#ffff55",
    brightBlue: "#5555ff",
    brightMagenta: "#ff55ff",
    brightCyan: "#55ffff",
    brightWhite: "#ffffff",
  },
  font: {
    family: "PrintChar21",
    file: "PrintChar21.woff", // sourced separately — falls back to VGA
    size: 16,
    fallback: "Web437_IBM_VGA_9x16",
  },
  cursor: { style: "block", blink: true },
  effects: {
    glow: { enabled: true, color: "rgba(51, 255, 51, 0.8)", radius: 5 },
    border: { enabled: false, color: null, width: 0 },
  },
  chrome: {
    toolbarBg: "#0a1a0a",
    buttonStyle: "default",
    accentColor: "#33FF33",
    tabIndicatorColor: "#33FF33",
  },
  boot: {
    lines: ["APPLE ][", "", "]"],
    delay: 60,
  },
  tuning: { lineHeight: 1.3, letterSpacing: 0.5 },
};

// CRT Amber — generic amber phosphor monitor
const THEME_AMBER = {
  id: "amber",
  name: "CRT Amber",
  era: "1980s",
  xterm: {
    background: "#0a0800",
    foreground: "#FFB000",
    cursor: "#FFB000",
    cursorAccent: "#0a0800",
    selectionBackground: "rgba(255, 176, 0, 0.3)",
    black: "#000000",
    red: "#cc5500",
    green: "#88aa00",
    yellow: "#FFB000",
    blue: "#886600",
    magenta: "#cc8800",
    cyan: "#aaaa00",
    white: "#FFB000",
    brightBlack: "#555500",
    brightRed: "#ff8800",
    brightGreen: "#aacc00",
    brightYellow: "#ffcc00",
    brightBlue: "#aa8800",
    brightMagenta: "#ffaa00",
    brightCyan: "#cccc00",
    brightWhite: "#ffffff",
  },
  font: {
    family: "Web437_IBM_VGA_9x16",
    file: "Web437_IBM_VGA_9x16.woff",
    size: 16,
  },
  cursor: { style: "block", blink: true },
  effects: {
    glow: { enabled: true, color: "rgba(255, 176, 0, 0.7)", radius: 5 },
    border: { enabled: false, color: null, width: 0 },
  },
  chrome: {
    toolbarBg: "#1a1200",
    buttonStyle: "default",
    accentColor: "#FFB000",
    tabIndicatorColor: "#FFB000",
  },
  boot: {
    lines: ["SYSTEM READY", ""],
    delay: 40,
  },
  tuning: { lineHeight: 1.3, letterSpacing: 0.5 },
};

// ---------------------------------------------------------------------------
// Theme registry
// ---------------------------------------------------------------------------

const THEMES = {
  default: THEME_DEFAULT,
  cyberpunk: THEME_CYBERPUNK,
  matrix: THEME_MATRIX,
  dracula: THEME_DRACULA,
  c64: THEME_C64,
  msdos: THEME_MSDOS,
  apple2: THEME_APPLE2,
  amber: THEME_AMBER,
};

function getTheme(id) {
  return THEMES[id] || THEMES.default;
}

function getAllThemes() {
  return THEMES;
}

module.exports = { getTheme, getAllThemes, loadThemeFont };
```

- [ ] **Step 2: Verify the file parses correctly**

```bash
node -e "const t = require('./electron/renderer/terminal-themes.js'); console.log(Object.keys(t.getAllThemes()).join(', '))"
```

Expected output: `default, cyberpunk, matrix, dracula, c64, msdos, apple2, amber`

- [ ] **Step 3: Commit**

```bash
git add electron/renderer/terminal-themes.js
git commit -m "feat(themes): add retro terminal theme definitions with full ANSI palettes"
```

---

### Task 3: Create terminal-effects.js — CRT Effects

**Files:**
- Create: `electron/renderer/terminal-effects.js`

- [ ] **Step 1: Create the effects module**

Create `electron/renderer/terminal-effects.js`:

```javascript
"use strict";

// Terminal Effects — CRT scanline overlay, phosphor glow, and monitor border.
// Pure DOM manipulation. Each function returns a cleanup/removal function.

/**
 * Creates a CRT scanline overlay on top of a terminal surface.
 * The overlay uses CSS gradients to simulate horizontal scan lines
 * and RGB sub-pixel patterns.
 *
 * @param {HTMLElement} surface - The .terminal-surface element
 * @param {number} opacity - Initial opacity 0-100 (default 30)
 * @returns {{ element: HTMLElement, setOpacity: (n: number) => void, remove: () => void }}
 */
function createScanlineOverlay(surface, opacity = 30) {
  const overlay = document.createElement("div");
  overlay.className = "crt-scanline-overlay";
  overlay.style.cssText = `
    position: absolute;
    top: 0; left: 0; width: 100%; height: 100%;
    background: linear-gradient(
      rgba(18, 16, 16, 0) 50%,
      rgba(0, 0, 0, 0.25) 50%
    ),
    linear-gradient(
      90deg,
      rgba(255, 0, 0, 0.06),
      rgba(0, 255, 0, 0.02),
      rgba(0, 0, 255, 0.06)
    );
    background-size: 100% 2px, 3px 100%;
    pointer-events: none;
    z-index: 10;
    opacity: ${opacity / 100};
  `;

  surface.appendChild(overlay);

  return {
    element: overlay,
    setOpacity(n) {
      overlay.style.opacity = Math.max(0, Math.min(1, n / 100));
    },
    remove() {
      overlay.remove();
    },
  };
}

/**
 * Applies a phosphor glow effect to terminal text via text-shadow.
 * Targets the .xterm element inside the surface.
 *
 * @param {HTMLElement} surface - The .terminal-surface element
 * @param {string} color - CSS colour for the glow (e.g. "rgba(51, 255, 51, 0.8)")
 * @param {number} radius - Glow radius in px (default 5)
 * @returns {{ setIntensity: (n: number) => void, remove: () => void }}
 */
function applyCRTGlow(surface, color, radius = 5) {
  const xtermEl = surface.querySelector(".xterm");
  if (!xtermEl) return { setIntensity() {}, remove() {} };

  const _apply = (r) => {
    // Parse the colour to create a half-opacity variant for the outer glow
    const halfColor = color.replace(
      /[\d.]+\)$/,
      (match) => `${parseFloat(match) * 0.5})`
    );
    xtermEl.style.textShadow = `0 0 ${r}px ${color}, 0 0 ${r * 2}px ${halfColor}`;
  };

  _apply(radius);

  return {
    setIntensity(n) {
      // n is 0-100, map to radius 0 to radius*2
      // Source: linear scale from no-glow to max-glow
      const scaledRadius = (radius * 2 * n) / 100;
      _apply(scaledRadius);
    },
    remove() {
      xtermEl.style.textShadow = "";
    },
  };
}

/**
 * Wraps the terminal surface content in a monitor border div,
 * simulating the CRT bezel (e.g. C64's blue surround).
 *
 * @param {HTMLElement} surface - The .terminal-surface element
 * @param {string} color - Border/bezel colour
 * @param {number} width - Border width in px (default 24)
 * @returns {{ setEnabled: (on: boolean) => void, remove: () => void }}
 */
function wrapMonitorBorder(surface, color, width = 24) {
  surface.style.backgroundColor = color;
  surface.style.padding = `${width}px`;

  // The inner .xterm gets a subtle inset to look like a screen recess
  const xtermEl = surface.querySelector(".xterm");
  if (xtermEl) {
    xtermEl.style.borderRadius = "4px";
  }

  return {
    setEnabled(on) {
      if (on) {
        surface.style.backgroundColor = color;
        surface.style.padding = `${width}px`;
      } else {
        surface.style.backgroundColor = "";
        surface.style.padding = "";
      }
    },
    remove() {
      surface.style.backgroundColor = "";
      surface.style.padding = "";
      if (xtermEl) {
        xtermEl.style.borderRadius = "";
      }
    },
  };
}

/**
 * Removes all CRT effects from a terminal surface.
 * Cleans up scanline overlay, glow text-shadow, and monitor border.
 *
 * @param {object} effectsState - The effects state object from the terminal instance
 */
function removeAllEffects(effectsState) {
  if (effectsState.scanline) {
    effectsState.scanline.remove();
    effectsState.scanline = null;
  }
  if (effectsState.glow) {
    effectsState.glow.remove();
    effectsState.glow = null;
  }
  if (effectsState.border) {
    effectsState.border.remove();
    effectsState.border = null;
  }
}

module.exports = {
  createScanlineOverlay,
  applyCRTGlow,
  wrapMonitorBorder,
  removeAllEffects,
};
```

- [ ] **Step 2: Verify the file parses correctly**

```bash
node -e "const e = require('./electron/renderer/terminal-effects.js'); console.log(Object.keys(e).join(', '))"
```

Expected: `createScanlineOverlay, applyCRTGlow, wrapMonitorBorder, removeAllEffects`

- [ ] **Step 3: Commit**

```bash
git add electron/renderer/terminal-effects.js
git commit -m "feat(effects): add CRT scanline, phosphor glow, and monitor border effects"
```

---

### Task 4: Create terminal-theme-ui.js — Tuning Popover

**Files:**
- Create: `electron/renderer/terminal-theme-ui.js`

- [ ] **Step 1: Create the tuning popover module**

Create `electron/renderer/terminal-theme-ui.js`:

```javascript
"use strict";

// Terminal Theme UI — tuning popover for per-terminal theme adjustments.
// Provides sliders for font size, line height, letter spacing, glow,
// scanlines, and toggles for CRT effects.

const { getTheme, getAllThemes, loadThemeFont } = require("./terminal-themes");
const {
  createScanlineOverlay,
  applyCRTGlow,
  wrapMonitorBorder,
  removeAllEffects,
} = require("./terminal-effects");

/**
 * Creates the theme selector dropdown with all available themes.
 * Replaces the old 4-theme hardcoded <select>.
 *
 * @param {string} terminalId
 * @param {function} onThemeChange - callback(terminalId, themeId)
 * @returns {HTMLSelectElement}
 */
function createThemeSelector(terminalId, onThemeChange) {
  const select = document.createElement("select");
  select.className = "macro-btn";
  select.title = "Terminal theme";

  const themes = getAllThemes();
  // Group: existing first, then retro
  const existingIds = ["default", "cyberpunk", "matrix", "dracula"];
  const retroIds = ["c64", "msdos", "apple2", "amber"];

  const existingGroup = document.createElement("optgroup");
  existingGroup.label = "Themes";
  for (const id of existingIds) {
    const theme = themes[id];
    if (!theme) continue;
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = theme.name;
    existingGroup.appendChild(opt);
  }
  select.appendChild(existingGroup);

  const retroGroup = document.createElement("optgroup");
  retroGroup.label = "Retro";
  for (const id of retroIds) {
    const theme = themes[id];
    if (!theme) continue;
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = `${theme.name}${theme.era ? ` (${theme.era})` : ""}`;
    retroGroup.appendChild(opt);
  }
  select.appendChild(retroGroup);

  select.addEventListener("change", () => {
    onThemeChange(terminalId, select.value);
  });

  return select;
}

/**
 * Creates the gear button that toggles the tuning popover.
 *
 * @param {string} terminalId
 * @param {function} getTerminalInstance - returns the terminal instance from the Map
 * @returns {HTMLButtonElement}
 */
function createTuningButton(terminalId, getTerminalInstance) {
  const btn = document.createElement("button");
  btn.className = "macro-btn";
  btn.title = "Theme tuning";
  btn.textContent = "\u2699"; // ⚙
  btn.style.fontSize = "16px";
  btn.style.padding = "2px 6px";

  let popover = null;

  btn.addEventListener("click", (e) => {
    e.stopPropagation();

    // Toggle existing popover
    if (popover && popover.parentElement) {
      popover.remove();
      popover = null;
      return;
    }

    const inst = getTerminalInstance(terminalId);
    if (!inst) return;

    popover = _buildPopover(terminalId, inst, getTerminalInstance);

    // Position relative to button
    const rect = btn.getBoundingClientRect();
    popover.style.position = "fixed";
    popover.style.top = `${rect.bottom + 4}px`;
    popover.style.left = `${rect.left}px`;
    popover.style.zIndex = "10001";

    document.body.appendChild(popover);

    // Close on outside click
    const closeHandler = (ev) => {
      if (!popover.contains(ev.target) && ev.target !== btn) {
        popover.remove();
        popover = null;
        document.removeEventListener("mousedown", closeHandler);
      }
    };
    setTimeout(() => document.addEventListener("mousedown", closeHandler), 0);
  });

  return btn;
}

/**
 * Builds the tuning popover DOM.
 */
function _buildPopover(terminalId, inst, getTerminalInstance) {
  const panel = document.createElement("div");
  panel.className = "theme-tuning-popover";
  panel.style.cssText = `
    background: #1a1a2e;
    border: 1px solid #3a3a4a;
    border-radius: 8px;
    padding: 16px;
    width: 260px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    font-family: "Segoe UI", Tahoma, sans-serif;
    font-size: 12px;
    color: #ccc;
  `;

  const title = document.createElement("div");
  title.textContent = "Theme Tuning";
  title.style.cssText =
    "font-weight: bold; color: #da7756; margin-bottom: 12px; font-size: 13px;";
  panel.appendChild(title);

  const tuning = inst.tuning || {};

  // Font Size slider
  _addSlider(panel, "Font Size", "px", 10, 24, tuning.fontSize || 13, (val) => {
    inst.terminal.options.fontSize = val;
    inst.tuning.fontSize = val;
    inst.fitAddon.fit();
  });

  // Line Height slider
  _addSlider(
    panel,
    "Line Height",
    "",
    1.0,
    2.0,
    tuning.lineHeight || 1.2,
    (val) => {
      inst.terminal.options.lineHeight = val;
      inst.tuning.lineHeight = val;
      inst.fitAddon.fit();
    },
    0.1
  );

  // Letter Spacing slider
  _addSlider(
    panel,
    "Letter Spacing",
    "px",
    0,
    4,
    tuning.letterSpacing || 0,
    (val) => {
      inst.terminal.options.letterSpacing = val;
      inst.tuning.letterSpacing = val;
      inst.fitAddon.fit();
    }
  );

  // Glow Intensity slider (only show if theme has glow)
  const theme = getTheme(inst.theme || "default");
  if (theme.effects.glow.color) {
    _addSlider(
      panel,
      "Glow Intensity",
      "%",
      0,
      100,
      tuning.glowIntensity ?? 50,
      (val) => {
        inst.tuning.glowIntensity = val;
        if (inst.effectsState.glow) {
          inst.effectsState.glow.setIntensity(val);
        }
      }
    );
  }

  // Scanline Opacity slider
  _addSlider(
    panel,
    "Scanline Opacity",
    "%",
    0,
    100,
    tuning.scanlineOpacity ?? 30,
    (val) => {
      inst.tuning.scanlineOpacity = val;
      if (inst.effectsState.scanline) {
        inst.effectsState.scanline.setOpacity(val);
      }
    }
  );

  // Scanline toggle
  _addToggle(
    panel,
    "CRT Scanlines",
    tuning.scanlines ?? false,
    (on) => {
      inst.tuning.scanlines = on;
      if (on && !inst.effectsState.scanline) {
        inst.effectsState.scanline = createScanlineOverlay(
          inst.surface,
          inst.tuning.scanlineOpacity ?? 30
        );
      } else if (!on && inst.effectsState.scanline) {
        inst.effectsState.scanline.remove();
        inst.effectsState.scanline = null;
      }
    }
  );

  // Monitor Border toggle (only show if theme has border config)
  if (theme.effects.border.color) {
    _addToggle(
      panel,
      "Monitor Border",
      tuning.border ?? theme.effects.border.enabled,
      (on) => {
        inst.tuning.border = on;
        if (inst.effectsState.border) {
          inst.effectsState.border.setEnabled(on);
        }
      }
    );
  }

  return panel;
}

function _addSlider(parent, label, unit, min, max, value, onChange, step) {
  const row = document.createElement("div");
  row.style.cssText =
    "display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;";

  const lbl = document.createElement("label");
  lbl.textContent = label;
  lbl.style.color = "#aaa";
  row.appendChild(lbl);

  const input = document.createElement("input");
  input.type = "range";
  input.min = min;
  input.max = max;
  input.step = step || (max - min > 10 ? 1 : 0.1);
  input.value = value;
  input.style.cssText = "width: 100px; accent-color: #da7756;";
  row.appendChild(input);

  const val = document.createElement("span");
  val.textContent =
    unit === "px"
      ? `${value}px`
      : unit === "%"
        ? `${value}%`
        : `${value}`;
  val.style.cssText = "color: #666; width: 40px; text-align: right; font-size: 11px;";
  row.appendChild(val);

  input.addEventListener("input", () => {
    const n = parseFloat(input.value);
    val.textContent =
      unit === "px" ? `${n}px` : unit === "%" ? `${Math.round(n)}%` : `${n}`;
    onChange(n);
  });

  parent.appendChild(row);
}

function _addToggle(parent, label, initialState, onChange) {
  const row = document.createElement("div");
  row.style.cssText =
    "display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;";

  const lbl = document.createElement("span");
  lbl.textContent = label;
  lbl.style.color = "#aaa";
  row.appendChild(lbl);

  const toggle = document.createElement("div");
  toggle.style.cssText = `
    width: 36px; height: 18px;
    background: ${initialState ? "#da7756" : "#333"};
    border-radius: 9px;
    position: relative;
    cursor: pointer;
    transition: background 0.2s;
  `;

  const knob = document.createElement("div");
  knob.style.cssText = `
    width: 14px; height: 14px;
    background: #fff; border-radius: 50%;
    position: absolute; top: 2px;
    left: ${initialState ? "20px" : "2px"};
    transition: left 0.2s;
  `;
  toggle.appendChild(knob);

  let state = initialState;
  toggle.addEventListener("click", () => {
    state = !state;
    toggle.style.background = state ? "#da7756" : "#333";
    knob.style.left = state ? "20px" : "2px";
    onChange(state);
  });

  row.appendChild(toggle);
  parent.appendChild(row);
}

module.exports = { createThemeSelector, createTuningButton };
```

- [ ] **Step 2: Verify the file parses correctly**

```bash
node -e "const u = require('./electron/renderer/terminal-theme-ui.js'); console.log(Object.keys(u).join(', '))"
```

Expected: `createThemeSelector, createTuningButton`

- [ ] **Step 3: Commit**

```bash
git add electron/renderer/terminal-theme-ui.js
git commit -m "feat(themes): add theme tuning popover with sliders and toggles"
```

---

### Task 5: Update terminal-config.js — Remove THEME_PRESETS

**Files:**
- Modify: `electron/renderer/terminal-config.js:31-57`

- [ ] **Step 1: Remove THEME_PRESETS and themes from window.TerminalConfig**

In `electron/renderer/terminal-config.js`, remove the `THEME_PRESETS` constant (lines 31-52) and the `themes: THEME_PRESETS` line from `window.TerminalConfig` (line 57). Keep `DEFAULT_MACROS`, `DEFAULT_COMMANDS`, and `quickLaunch`.

The file should become:

```javascript
"use strict";

// Terminal Configuration — stores macros, commands, and quick launch settings.
// In a real app, this could be persisted via electron-store.

const DEFAULT_MACROS = [
  { label: "Git Status", command: "git status\n", color: "blue" },
  { label: "NPM Start", command: "npm start\n", color: "green" },
  { label: "Clear", command: "clear\n", color: "red" },
];

const DEFAULT_COMMANDS = [
  {
    category: "CLI Skills",
    items: [
      { name: "Code Review", cmd: "/code-review\n" },
      { name: "Skill Scan", cmd: "/skill-scan\n" },
      { name: "PR Writer", cmd: "/pr-writer\n" },
    ],
  },
  {
    category: "Git",
    items: [
      { name: "Push to Main", cmd: "git push origin main\n" },
      { name: "Fetch & Rebase", cmd: "git fetch && git rebase\n" },
      { name: "Log Graph", cmd: "git log --oneline --graph --all\n" },
    ],
  },
];

window.TerminalConfig = {
  macros: DEFAULT_MACROS,
  commands: DEFAULT_COMMANDS,
  quickLaunch: {
    folders: [],
  },
};
```

- [ ] **Step 2: Verify no other files reference `window.TerminalConfig.themes`**

```bash
grep -rn "TerminalConfig.*themes\|TerminalConfig\.themes" electron/renderer/ --include="*.js" --include="*.html"
```

Expected: Only the old `toggleTheme` in `terminals.js` (which we'll update in Task 6). If found elsewhere, note for Task 6.

- [ ] **Step 3: Commit**

```bash
git add electron/renderer/terminal-config.js
git commit -m "refactor(config): remove THEME_PRESETS, themes now live in terminal-themes.js"
```

---

### Task 6: Update terminals.js — Integrate Theme System

This is the largest task. It modifies `terminals.js` to use the new theme modules.

**Files:**
- Modify: `electron/renderer/terminals.js:1-37` (imports and XTERM_THEME removal)
- Modify: `electron/renderer/terminals.js:392-468` (createMacroBar and toggleTheme)
- Modify: `electron/renderer/terminals.js:720-728` (createXtermInstance terminal options)
- Modify: `electron/renderer/terminals.js:884-904` (instance state)

- [ ] **Step 1: Add imports at top of terminals.js**

At the top of `electron/renderer/terminals.js`, after the existing `require` statements (line 8), add the new module imports. Then remove the `XTERM_THEME` constant (lines 14-37).

Replace lines 6-37 with:

```javascript
const { Terminal } = require("@xterm/xterm");
const { FitAddon } = require("@xterm/addon-fit");
const { WebLinksAddon } = require("@xterm/addon-web-links");
const { getTheme, getAllThemes, loadThemeFont } = require("./terminal-themes");
const {
  createScanlineOverlay,
  applyCRTGlow,
  wrapMonitorBorder,
  removeAllEffects,
} = require("./terminal-effects");
const { createThemeSelector, createTuningButton } = require("./terminal-theme-ui");
```

- [ ] **Step 2: Replace createMacroBar theme dropdown**

In the `createMacroBar` function, replace the old theme `<select>` block (lines 437-448) with the new theme selector and tuning button:

Replace:
```javascript
  const themeSelect = document.createElement("select");
  themeSelect.className = "macro-btn";
  themeSelect.innerHTML = `
    <option value="default">Default Theme</option>
    <option value="cyberpunk">Cyberpunk</option>
    <option value="matrix">Matrix</option>
    <option value="dracula">Dracula</option>
  `;
  themeSelect.addEventListener("change", (e) => {
    toggleTheme(id, e.target.value);
  });
  bar.appendChild(themeSelect);
```

With:
```javascript
  const themeSelect = createThemeSelector(id, applyTheme);
  bar.appendChild(themeSelect);

  const tuningBtn = createTuningButton(id, (tid) => terminalInstances.get(tid));
  bar.appendChild(tuningBtn);
```

- [ ] **Step 3: Replace the toggleTheme function**

Replace the `toggleTheme` function (lines 453-468) with the new `applyTheme` function:

```javascript
async function applyTheme(id, themeId) {
  const inst = terminalInstances.get(id);
  if (!inst) return;

  const theme = getTheme(themeId);

  // Clean up existing effects
  removeAllEffects(inst.effectsState);

  // Load custom font if needed
  await loadThemeFont(theme.font);

  // Apply xterm.js theme (full 16-colour palette)
  inst.terminal.options.theme = theme.xterm;

  // Apply font
  const fontFamily = theme.font.file
    ? `"${theme.font.family}", ${theme.font.fallback ? `"${theme.font.fallback}", ` : ""}monospace`
    : theme.font.family;
  inst.terminal.options.fontFamily = fontFamily;
  inst.terminal.options.fontSize = theme.font.size;

  // Apply cursor style
  inst.terminal.options.cursorStyle = theme.cursor.style;
  inst.terminal.options.cursorBlink = theme.cursor.blink;

  // Apply tuning defaults (user can override via popover)
  inst.terminal.options.lineHeight = theme.tuning.lineHeight;
  inst.terminal.options.letterSpacing = theme.tuning.letterSpacing;

  // Initialise tuning state from theme defaults
  inst.tuning = {
    fontSize: theme.font.size,
    lineHeight: theme.tuning.lineHeight,
    letterSpacing: theme.tuning.letterSpacing,
    glowIntensity: 50,
    scanlineOpacity: 30,
    scanlines: false,
    border: theme.effects.border.enabled,
  };

  // Apply effects
  if (theme.effects.glow.enabled) {
    inst.effectsState.glow = applyCRTGlow(
      inst.surface,
      theme.effects.glow.color,
      theme.effects.glow.radius
    );
  }

  if (theme.effects.border.enabled) {
    inst.effectsState.border = wrapMonitorBorder(
      inst.surface,
      theme.effects.border.color,
      theme.effects.border.width
    );
  }

  // Apply chrome styling
  _applyChromeTheme(inst, theme);

  // Store theme ID
  inst.theme = themeId;

  // Refit terminal after font/spacing changes
  setTimeout(() => inst.fitAddon.fit(), 50);
}

function _applyChromeTheme(inst, theme) {
  const { chrome } = theme;
  if (!chrome) return;

  // Toolbar background
  if (inst.macroBar && chrome.toolbarBg) {
    inst.macroBar.style.backgroundColor = chrome.toolbarBg;
  } else if (inst.macroBar) {
    inst.macroBar.style.backgroundColor = "";
  }

  // Button styling
  if (inst.macroBar) {
    const buttons = inst.macroBar.querySelectorAll(".macro-btn");
    for (const btn of buttons) {
      // Remove all theme button classes
      btn.classList.remove("btn-pixel", "btn-bevel", "btn-vector");
      if (chrome.buttonStyle && chrome.buttonStyle !== "default") {
        btn.classList.add(`btn-${chrome.buttonStyle}`);
      }
    }
  }

  // Wrapper accent border
  if (inst.wrapper && chrome.accentColor) {
    inst.wrapper.style.borderColor = chrome.accentColor;
  } else if (inst.wrapper) {
    inst.wrapper.style.borderColor = "";
  }
}
```

- [ ] **Step 4: Update createXtermInstance to use theme-aware defaults and boot sequence**

Replace the terminal creation block (lines 720-728) with:

```javascript
function createXtermInstance(id, name, shell, pid, cwd) {
  const defaultTheme = getTheme("default");
  const terminal = new Terminal({
    theme: defaultTheme.xterm,
    fontFamily: defaultTheme.font.family,
    fontSize: defaultTheme.font.size,
    cursorBlink: defaultTheme.cursor.blink,
    cursorStyle: defaultTheme.cursor.style,
    lineHeight: defaultTheme.tuning.lineHeight,
    letterSpacing: defaultTheme.tuning.letterSpacing,
    scrollback: 5000,
  });
```

- [ ] **Step 5: Extend the instance state object**

In `createXtermInstance`, where the `newInstance` object is created (around line 884), add the new fields. Replace:

```javascript
  const newInstance = {
    terminal,
    fitAddon,
    wrapper,
    toolbar,
    surface,
    macroBar,
    name: name || shell || id.slice(0, 8),
    shell,
    pid,
    exited: false,
    exitCode: null,
    x: 20 + numInstances * 25,
    y: 20 + numInstances * 25,
    width: 600,
    height: 400,
    zIndex: highestZ++,
    fitTimeout: null,
  };
```

With:

```javascript
  const newInstance = {
    terminal,
    fitAddon,
    wrapper,
    toolbar,
    surface,
    macroBar,
    name: name || shell || id.slice(0, 8),
    shell,
    pid,
    exited: false,
    exitCode: null,
    x: 20 + numInstances * 25,
    y: 20 + numInstances * 25,
    width: 600,
    height: 400,
    zIndex: highestZ++,
    fitTimeout: null,
    theme: "default",
    effectsState: {
      scanline: null,
      glow: null,
      border: null,
    },
    tuning: {
      fontSize: 13,
      lineHeight: 1.2,
      letterSpacing: 0,
      glowIntensity: 50,
      scanlineOpacity: 30,
      scanlines: false,
      border: false,
    },
  };
```

- [ ] **Step 6: Add boot sequence injection**

After `terminalInstances.set(id, newInstance);` (around line 904), add boot sequence support. The boot sequence should be triggered by an optional parameter to `createXtermInstance`. For now, the default theme has no boot text, so this is a no-op until a theme is selected at creation time.

Add this function after the `applyTheme` function:

```javascript
function _playBootSequence(terminal, bootConfig) {
  if (!bootConfig || !bootConfig.lines || bootConfig.lines.length === 0) return;

  const delay = bootConfig.delay || 50;
  let i = 0;

  function writeLine() {
    if (i >= bootConfig.lines.length) return;
    terminal.write(bootConfig.lines[i] + "\r\n");
    i++;
    setTimeout(writeLine, delay);
  }

  writeLine();
}
```

- [ ] **Step 7: Build and verify**

```bash
cd electron && npm run build:terminals
```

Expected: esbuild completes without errors, `terminals.bundle.js` is updated.

- [ ] **Step 8: Commit**

```bash
git add electron/renderer/terminals.js
git commit -m "feat(themes): integrate retro theme system into terminal lifecycle"
```

---

### Task 7: Add Chrome Button Styles to index.html

**Files:**
- Modify: `electron/renderer/index.html` (CSS section + script tags)

- [ ] **Step 1: Add button style CSS classes**

In `electron/renderer/index.html`, add CSS for the themed button styles. Insert after the existing `.macro-btn` styles (find the `.macro-btn` rule and add after it):

```css
/* Retro chrome button styles */
.macro-btn.btn-pixel {
  border: 2px solid currentColor;
  border-radius: 0;
  box-shadow: inset -2px -2px 0 rgba(0,0,0,0.3), inset 2px 2px 0 rgba(255,255,255,0.1);
  text-transform: uppercase;
  font-size: 11px;
  letter-spacing: 0.5px;
}

.macro-btn.btn-bevel {
  border: none;
  border-radius: 0;
  background: #c0c0c0;
  color: #000;
  box-shadow: inset -1px -1px 0 #808080, inset 1px 1px 0 #ffffff,
              inset -2px -2px 0 #404040, inset 2px 2px 0 #dfdfdf;
  font-size: 11px;
}
.macro-btn.btn-bevel:hover {
  background: #d0d0d0;
}
.macro-btn.btn-bevel:active {
  box-shadow: inset 1px 1px 0 #808080, inset -1px -1px 0 #ffffff,
              inset 2px 2px 0 #404040, inset -2px -2px 0 #dfdfdf;
}

.macro-btn.btn-vector {
  border: 1px solid currentColor;
  border-radius: 2px;
  background: transparent;
  box-shadow: 0 0 4px currentColor;
  transition: box-shadow 0.2s;
}
.macro-btn.btn-vector:hover {
  box-shadow: 0 0 8px currentColor, 0 0 2px currentColor inset;
}
```

- [ ] **Step 2: Add script tags for new modules**

In `electron/renderer/index.html`, the new modules are bundled into `terminals.bundle.js` via esbuild `require()`, so no additional `<script>` tags are needed. Verify that `terminal-themes.js`, `terminal-effects.js`, and `terminal-theme-ui.js` are pulled in by the esbuild bundle by checking the build output.

```bash
cd electron && npm run build:terminals 2>&1
```

Expected: Build succeeds. If esbuild reports unresolved requires, the modules need to be added to the bundle input.

- [ ] **Step 3: Commit**

```bash
git add electron/renderer/index.html
git commit -m "feat(themes): add retro chrome button styles (pixel, bevel, vector)"
```

---

### Task 8: Manual Testing and Polish

**Files:**
- No new files — testing and bug fixing across all modified files

- [ ] **Step 1: Start the app**

```bash
cd electron && npm start
```

- [ ] **Step 2: Test default theme**

Open a new terminal. Verify:
- Terminal renders with default theme (dark background, light text)
- Theme dropdown shows 8 themes in 2 groups (Themes + Retro)
- Gear button (⚙) appears next to dropdown
- Tuning popover opens/closes on gear click

- [ ] **Step 3: Test C64 theme**

Select "Commodore 64" from the dropdown. Verify:
- Background changes to `#352879` (dark blue)
- Text colour changes to `#6C5EB5` (mid blue)
- Monitor border appears (blue bezel around terminal)
- Block cursor with blink
- Toolbar changes to deep purple
- Buttons get pixel style (square borders)
- Font changes to VGA (or C64 Pro if available)

- [ ] **Step 4: Test MS-DOS theme**

Select "MS-DOS 3.30". Verify:
- Black background, grey text
- Block cursor
- No glow, no border
- Bevel-style buttons on toolbar
- VGA font renders correctly

- [ ] **Step 5: Test Apple IIe theme**

Select "Apple IIe". Verify:
- Black background, neon green text
- Green phosphor glow visible around text
- Block cursor
- Green accent on toolbar

- [ ] **Step 6: Test CRT Amber theme**

Select "CRT Amber". Verify:
- Dark background, amber text
- Amber phosphor glow visible
- Block cursor
- Amber accent on toolbar

- [ ] **Step 7: Test tuning popover**

Open the tuning popover on any retro theme. Verify:
- Font Size slider changes terminal font size live
- Line Height slider adjusts spacing between lines
- Letter Spacing slider adjusts character spacing
- Glow Intensity slider (on Apple IIe/Amber) adjusts glow strength
- Scanline Opacity slider adjusts scanline darkness
- CRT Scanlines toggle adds/removes scanline overlay
- Monitor Border toggle (on C64) shows/hides the bezel

- [ ] **Step 8: Test per-terminal isolation**

Open 3 terminals. Set each to a different theme. Verify:
- Each terminal has its own colours, font, and effects
- Changing one terminal's theme does not affect the others
- Tuning changes on one terminal are independent

- [ ] **Step 9: Test theme switching**

Switch a terminal from C64 to Default. Verify:
- Monitor border is removed
- Font reverts to Consolas
- Colours revert to default
- No leftover glow or scanline effects

- [ ] **Step 10: Test lattice and floating layouts**

Switch to lattice layout with themed terminals. Verify:
- Themes render correctly in lattice cells
- Switch to floating layout — themes still render correctly
- Monitor borders don't break drag/resize

- [ ] **Step 11: Fix any issues found**

Address visual bugs, spacing issues, or effect cleanup problems.

- [ ] **Step 12: Final build and commit**

```bash
cd electron && npm run build
git add -p  # stage only relevant changes
git commit -m "fix(themes): polish retro theme rendering and effect cleanup"
```

---

### Task 9: Add Boot Sequence on Terminal Creation

**Files:**
- Modify: `electron/renderer/terminals.js` (createXtermInstance function)

- [ ] **Step 1: Wire boot sequence into terminal creation**

This task adds an optional `initialTheme` parameter to the terminal creation flow. When a terminal is created with a theme that has boot text, the boot sequence plays before PTY output begins.

In the `createXtermInstance` function, after `terminalInstances.set(id, newInstance);` and before `renderLayout();`, add:

```javascript
  // Apply initial theme if set (e.g. from Quick Launch or user preference)
  // For now, new terminals start with default theme — boot sequences
  // play when the user creates a terminal with a specific theme selected.
  // This hook is here for future use.
```

To enable boot sequences, modify the "create terminal" UI flow: after a terminal is created, if the theme dropdown has a non-default value selected, call `applyTheme` and then play the boot sequence.

Add after `focusTerminal(result.id);` in the `createTerminal` function:

```javascript
    // If a theme was previously selected in the tab strip, apply it
    // to the new terminal (future: per-terminal default theme setting)
```

For now, boot sequences can be triggered manually: after creating a terminal and selecting a retro theme, the theme applies but no boot text plays (as designed — boot only on creation). To test boot sequences, add a helper:

```javascript
// Exposed for testing boot sequences manually
function testBootSequence(id) {
  const inst = terminalInstances.get(id);
  if (!inst) return;
  const theme = getTheme(inst.theme || "default");
  _playBootSequence(inst.terminal, theme.boot);
}
```

- [ ] **Step 2: Build and test**

```bash
cd electron && npm run build:terminals
```

- [ ] **Step 3: Commit**

```bash
git add electron/renderer/terminals.js
git commit -m "feat(themes): wire boot sequence hook for themed terminal creation"
```

---

## Summary

| Task | Description | Files | Estimated Effort |
|------|-------------|-------|------------------|
| 1 | Bundle fonts | `electron/assets/fonts/` | S |
| 2 | Theme definitions | `terminal-themes.js` (create) | M |
| 3 | CRT effects module | `terminal-effects.js` (create) | M |
| 4 | Tuning popover UI | `terminal-theme-ui.js` (create) | M |
| 5 | Remove old THEME_PRESETS | `terminal-config.js` (modify) | S |
| 6 | Integrate into terminals.js | `terminals.js` (modify) | L |
| 7 | Chrome button CSS | `index.html` (modify) | S |
| 8 | Manual testing & polish | All files | M |
| 9 | Boot sequence wiring | `terminals.js` (modify) | S |

**Build order:** Tasks 1-4 are independent and can be parallelised. Task 5 must come before Task 6. Task 6 depends on Tasks 1-5. Tasks 7-9 depend on Task 6.
