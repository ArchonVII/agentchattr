# Terminal Theme Bridging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the user switches the app theme, new terminals default to a matching terminal theme. Existing terminals are unaffected. Add NES and System 6 terminal themes to fill the gaps.

**Architecture:** A mapping table in `theme-registry.js` pairs each app theme id with a recommended terminal theme id. The terminal creation flow reads the current app theme, looks up the mapped terminal theme, and uses it as the default instead of hardcoded `"default"`. Two new terminal themes (NES and System 6) are added to `terminal-themes.js` to complete the pairings.

**Tech Stack:** JS (terminal-themes.js, theme-registry.js, terminals.js), CSS (terminal chrome), esbuild rebuild

**Spec:** Extends `docs/superpowers/specs/2026-04-14-css-theme-system-design.md`

---

## File Map

| Action  | File                                         | Responsibility                                                                    |
| ------- | -------------------------------------------- | --------------------------------------------------------------------------------- |
| Modify  | `electron/renderer/terminal-themes.js`       | Add NES and System 6 terminal theme definitions                                   |
| Modify  | `electron/renderer/themes/theme-registry.js` | Add `terminalTheme` field to each app theme entry                                 |
| Modify  | `electron/renderer/terminals.js`             | Read current app theme on terminal creation, use mapped terminal theme as default |
| Rebuild | `electron/renderer/terminals.bundle.js`      | Rebuild after terminals.js change                                                 |
| Rebuild | `electron/renderer/themes/themes.bundle.js`  | Rebuild after theme-registry.js change                                            |

---

### Task 1: Add NES Terminal Theme

**Files:**

- Modify: `electron/renderer/terminal-themes.js`

- [ ] **Step 1: Add NES theme definition after the `amber` entry**

Insert before the closing `};` of the THEMES object:

```javascript
// ── NES (8-bit) ───────────────────────────────────────────────────────
nes: {
  id: "nes",
  name: "NES",
  era: "8-bit",
  xterm: {
    // NES colour palette — sourced from NES PPU palette approximations
    // Reference: https://www.nesdev.org/wiki/PPU_palettes
    background: "#212529",
    foreground: "#fcfcfc",
    cursor: "#e76e55",
    cursorAccent: "#212529",
    selectionBackground: "rgba(231, 110, 85, 0.3)",
    black: "#212529",
    red: "#e76e55",      // NES red
    green: "#4aa52e",     // NES green
    yellow: "#e8a33e",    // NES gold
    blue: "#3a5fc4",      // NES blue
    magenta: "#b53cc0",   // NES purple
    cyan: "#4ac7c4",      // NES cyan
    white: "#c0c0c0",
    brightBlack: "#4a4a4a",
    brightRed: "#ff9e8a",
    brightGreen: "#7fdb6a",
    brightYellow: "#ffd06b",
    brightBlue: "#6b8cff",
    brightMagenta: "#e06bef",
    brightCyan: "#7fffff",
    brightWhite: "#fcfcfc",
  },
  font: {
    family: "Press Start 2P",
    file: "PressStart2P-Regular.ttf",
    fallback: "monospace",
    size: 12, // px; Press Start 2P renders large, keep small — user instruction
  },
  cursor: { style: "block", blink: true },
  effects: {
    glow: { enabled: false, color: null, radius: 0 },
    border: { enabled: false, color: null, width: 0 },
  },
  chrome: {
    toolbarBg: "#1a1d21",
    buttonStyle: "pixel",
    accentColor: "#e76e55",
    tabIndicatorColor: "#e76e55", // matches NES red — design spec
  },
  boot: {
    lines: [],
    delay: 0,
  },
  tuning: {
    lineHeight: 1.4, // extra leading for pixel font readability — user instruction
    letterSpacing: 0, // Press Start 2P has built-in spacing — user instruction
  },
},
```

- [ ] **Step 2: Add NES to the retroIds array in terminal-theme-ui.js**

In `electron/renderer/terminal-theme-ui.js`, find the `retroIds` array (around line 44) and add `"nes"`:

```javascript
const retroIds = ["c64", "msdos", "apple2", "amber", "nes"];
```

- [ ] **Step 3: Commit**

```bash
git add electron/renderer/terminal-themes.js electron/renderer/terminal-theme-ui.js
git commit -m "feat(themes): add NES 8-bit terminal theme"
```

---

### Task 2: Add System 6 Terminal Theme

**Files:**

- Modify: `electron/renderer/terminal-themes.js`
- Modify: `electron/renderer/terminal-theme-ui.js`

- [ ] **Step 1: Add System 6 theme definition after the NES entry**

Insert in the THEMES object:

```javascript
// ── SYSTEM 6 (Classic Mac) ────────────────────────────────────────────
system6: {
  id: "system6",
  name: "System 6",
  era: "1988",
  xterm: {
    // Classic Mac monochrome — black on white, 1-bit aesthetic
    // Source: Apple Human Interface Guidelines (1987)
    background: "#ffffff",
    foreground: "#000000",
    cursor: "#000000",
    cursorAccent: "#ffffff",
    selectionBackground: "rgba(0, 0, 0, 0.25)",
    black: "#000000",
    red: "#000000",       // monochrome — all dark
    green: "#000000",
    yellow: "#444444",
    blue: "#000000",
    magenta: "#000000",
    cyan: "#444444",
    white: "#ffffff",
    brightBlack: "#555555",
    brightRed: "#333333",
    brightGreen: "#333333",
    brightYellow: "#777777",
    brightBlue: "#333333",
    brightMagenta: "#333333",
    brightCyan: "#777777",
    brightWhite: "#ffffff",
  },
  font: {
    family: "Monaco",
    file: null, // system font — system.css bundles Chicago but Monaco is for terminal
    fallback: "monospace",
    size: 13, // px — user instruction
  },
  cursor: { style: "block", blink: true },
  effects: {
    glow: { enabled: false, color: null, radius: 0 },
    border: { enabled: true, color: "#000000", width: 4 }, // black bezel like Mac screen — user instruction
  },
  chrome: {
    toolbarBg: "#e8e8e8",
    buttonStyle: "default",
    accentColor: "#000000",
    tabIndicatorColor: "#000000", // matches monochrome — design spec
  },
  boot: {
    lines: ["Welcome to Macintosh.", ""],
    delay: 60, // ms per character — user instruction
  },
  tuning: {
    lineHeight: 1.2, // standard Mac row spacing — user instruction
    letterSpacing: 0, // user instruction
  },
},
```

- [ ] **Step 2: Add system6 to the retroIds array in terminal-theme-ui.js**

```javascript
const retroIds = ["c64", "msdos", "apple2", "amber", "nes", "system6"];
```

- [ ] **Step 3: Commit**

```bash
git add electron/renderer/terminal-themes.js electron/renderer/terminal-theme-ui.js
git commit -m "feat(themes): add System 6 Classic Mac terminal theme"
```

---

### Task 3: Add Terminal Theme Mapping to Registry

**Files:**

- Modify: `electron/renderer/themes/theme-registry.js`

- [ ] **Step 1: Add `terminalTheme` field to each entry in APP_THEMES**

Each app theme entry gets a `terminalTheme` field — the id of the recommended terminal theme to use for new terminals when this app theme is active:

```javascript
const APP_THEMES = [
  {
    id: "default",
    name: "Default",
    era: null,
    adapter: null,
    font: null,
    terminalTheme: "default", // ← ADD THIS
    preview: { bg: "#12121e", fg: "#e0e0e0", accent: "#da7756" },
  },
  {
    id: "nes",
    name: "NES",
    era: "8-bit",
    adapter: "adapter-nes.css",
    font: {
      family: "Press Start 2P",
      file: "PressStart2P-Regular.ttf",
      format: "truetype",
    },
    terminalTheme: "nes", // ← ADD THIS
    preview: { bg: "#212529", fg: "#fff", accent: "#e76e55" },
  },
  {
    id: "win98",
    name: "Windows 98",
    era: "1998",
    adapter: "adapter-98.css",
    font: null,
    terminalTheme: "msdos", // ← ADD THIS — closest era match
    preview: { bg: "#008080", fg: "#000", accent: "#000080" },
  },
  {
    id: "system6",
    name: "System 6",
    era: "1988",
    adapter: "adapter-system.css",
    font: null,
    terminalTheme: "system6", // ← ADD THIS
    preview: { bg: "#fff", fg: "#000", accent: "#000" },
  },
  {
    id: "c64",
    name: "Commodore 64",
    era: "1982",
    adapter: "adapter-c64.css",
    font: {
      family: "C64_Pro_Mono",
      file: "C64_Pro_Mono-STYLE.woff",
      format: "woff",
    },
    terminalTheme: "c64", // ← ADD THIS
    preview: { bg: "#352879", fg: "#6C5EB5", accent: "#6C5EB5" },
  },
];
```

- [ ] **Step 2: Rebuild themes bundle**

```bash
cd electron && npm run build:themes
```

- [ ] **Step 3: Commit**

```bash
git add electron/renderer/themes/theme-registry.js electron/renderer/themes/themes.bundle.js
git commit -m "feat(themes): add terminalTheme mapping to app theme registry"
```

---

### Task 4: Wire Terminal Creation to App Theme

**Files:**

- Modify: `electron/renderer/terminals.js`

- [ ] **Step 1: Import getCurrentAppTheme and getAppTheme**

At the top of `electron/renderer/terminals.js`, find the existing imports from terminal-themes.js. After them, add:

```javascript
const { getCurrentAppTheme } = require("./themes/theme-loader");
const { getAppTheme } = require("./themes/theme-registry");
```

- [ ] **Step 2: Find the terminal creation function**

Read `terminals.js` to find where new terminals are created and the default theme is set. Look for where `applyTheme` is first called for a new terminal — likely in a `createTerminal` or similar function. The current code probably does something like:

```javascript
applyTheme(id, "default");
```

- [ ] **Step 3: Replace the hardcoded default with the mapped theme**

Change the default theme lookup to:

```javascript
// Use the app theme's recommended terminal theme as the default for new terminals
const appTheme = getAppTheme(getCurrentAppTheme());
const defaultTerminalTheme = appTheme.terminalTheme || "default";
applyTheme(id, defaultTerminalTheme);
```

Also update the theme selector dropdown's initial value to match. Find where `createThemeSelector` is called and ensure the initial value uses the same logic:

```javascript
const selector = createThemeSelector(id, (termId, themeId) => {
  applyTheme(termId, themeId);
});
selector.value = defaultTerminalTheme;
```

- [ ] **Step 4: Rebuild terminals bundle**

```bash
cd electron && npm run build:terminals
```

- [ ] **Step 5: Commit**

```bash
git add electron/renderer/terminals.js electron/renderer/terminals.bundle.js
git commit -m "feat(themes): new terminals default to app theme's recommended terminal theme"
```

---

### Task 5: Test the Full Flow

**Files:** None (testing only)

- [ ] **Step 1: Start the app**

```bash
cd electron && npm start
```

- [ ] **Step 2: Test default → default mapping**

With Default app theme selected, open a new terminal. It should use the Default terminal theme (dark palette, Consolas font).

- [ ] **Step 3: Test Win98 → MS-DOS mapping**

Switch app theme to Windows 98. Open a new terminal. It should default to MS-DOS terminal theme (black background, VGA grey text, IBM VGA font). The existing terminal should keep its original theme.

- [ ] **Step 4: Test C64 → C64 mapping**

Switch app theme to Commodore 64. Open a new terminal. It should default to C64 terminal theme (blue background, light blue text, C64 Pro Mono font, boot sequence).

- [ ] **Step 5: Test NES → NES mapping**

Switch to NES app theme. Open a new terminal. It should default to NES terminal theme (dark background, Press Start 2P font, pixel buttons).

- [ ] **Step 6: Test System 6 → System 6 mapping**

Switch to System 6 app theme. Open a new terminal. It should default to System 6 terminal theme (white background, black text, Monaco font, "Welcome to Macintosh." boot).

- [ ] **Step 7: Test terminal independence**

After step 6, switch the app theme back to Default. The System 6 terminal you just opened should still be System 6. Only new terminals should pick up the new default.

- [ ] **Step 8: Test per-terminal override**

With NES app theme active, open a terminal (defaults to NES). Use the per-terminal theme dropdown to switch it to Dracula. It should work — the per-terminal picker still overrides.

- [ ] **Step 9: Commit any fixes**

```bash
git add -p
git commit -m "fix(themes): address terminal theme bridging test findings"
```
