# CSS-to-ANSI Translation Layer

**Date:** 2026-04-15
**Status:** Design approved
**Scope:** Theme-aware terminal output for both Python backend (Rich) and Node.js TUI (Ink/Chalk)

---

## 1. Goal

Synchronise terminal output styling with the active Electron app theme (Default, NES, Win98, System 6, C64). Currently the Python backend uses plain `print()` and stdlib `logging` with zero colour formatting, and no Node.js CLI layer exists. This feature bridges the 30-variable CSS theme system into ANSI escape sequences via two consumers:

- **Python (Rich)** — themed console output for the server process
- **Node.js (Ink + Chalk)** — interactive TUI dashboard for the Electron-embedded terminals

---

## 2. Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│  SOURCE OF TRUTH                                      │
│  electron/renderer/themes/theme-registry.js           │
│  electron/renderer/themes/base.css + adapter-*.css    │
│  electron/renderer/terminal-themes.js                 │
└──────────────┬───────────────────────┬────────────────┘
               │                       │
          build-time                runtime IPC
          generation               (theme changes)
               │                       │
     ┌─────────▼──────────┐   ┌────────▼────────────┐
     │  theme_snapshot.json│   │  ipcMain →          │
     │  (data/ directory)  │   │  "theme-snapshot"   │
     └────────┬───────────┘   │  channel             │
              │               └────────┬─────────────┘
     ┌────────▼───────────┐   ┌────────▼─────────────┐
     │  Python: Rich      │   │  Node.js: Ink/Chalk  │
     │  ThemeManager      │   │  TUI Dashboard       │
     │  (reads JSON once  │   │  (receives live      │
     │   at boot)         │   │   theme updates)     │
     └────────────────────┘   └──────────────────────┘
```

**Delivery model: Hybrid (approach 3)**

- Build-time: a generator script reads the theme registry + CSS adapters and produces `data/theme_snapshot.json` containing all theme palettes pre-mapped to ANSI-friendly hex values.
- Runtime: the Ink TUI receives live theme-change events via existing `app-theme-changed` IPC channel.
- The Python server reads the snapshot once at boot. It does not need live switching (it is a background process).

---

## 3. Theme Snapshot Schema

The generator produces a single JSON scroll at `data/theme_snapshot.json`. The schema has four layers:

### 3.1 Core CSS & ANSI Palettes

Fundamental colours for backgrounds, borders, and standard terminal text.

- **`css`** — High-level variables from the Electron UI chrome (16 values):
  `bg_app`, `bg_surface`, `bg_elevated`, `bg_deep`, `bg_sunken`,
  `fg_primary`, `fg_secondary`, `fg_muted`, `fg_dim`, `fg_faint`,
  `accent`, `accent_hover`, `accent_danger`, `accent_success`,
  `border`, `border_strong`

- **`ansi`** — The 16-colour ANSI palette sourced from the mapped terminal theme's `xterm` object. Standard + bright variants.

### 3.2 Layout & Typography Metadata

Structural look of panels and banners.

| Field        | Type   | Purpose                        | Examples                                        |
| ------------ | ------ | ------------------------------ | ----------------------------------------------- |
| `richBox`    | string | Rich box constant name         | `ROUNDED`, `DOUBLE`, `HEAVY`, `SQUARE`, `ASCII` |
| `inkBorder`  | string | Ink `borderStyle` prop         | `round`, `bold`, `doubleSingle`, `single`       |
| `bannerFont` | string | FIGlet font for startup banner | `slant`, `block`, `speed`, `mini`, `banner3`    |
| `glyphSet`   | string | Character set for UI elements  | `unicode`, `ascii`, `petscii`, `cp437`          |

### 3.3 Visual Effects & CRT Simulation

The "vibe layer" — simulated hardware artefacts that bring retro themes to life.

| Field                          | Type      | Default | Purpose                                          |
| ------------------------------ | --------- | ------- | ------------------------------------------------ |
| `effects.bg_glow`              | hex+alpha | `null`  | Outer shadow/glow around window panels           |
| `effects.scanline_opacity`     | float 0-1 | `0.0`   | Dim alternating text rows to mimic CRT scanlines |
| `effects.flicker_intensity`    | float 0-1 | `0.0`   | Subtle brightness pulsing for unstable displays  |
| `effects.baud_rate`            | int (bps) | `0`     | Simulated modem text speed (0 = instant)         |
| `effects.chromatic_aberration` | int (px)  | `0`     | Colour channel shift (Electron renderer only)    |

### 3.4 Interaction & State Metadata

How the UI responds to events.

| Field            | Type   | Examples                                    | Purpose                    |
| ---------------- | ------ | ------------------------------------------- | -------------------------- |
| `loaderStyle`    | string | `dots`, `classic`, `meter`                  | Loading spinner type       |
| `errorIcon`      | string | `bomb`, `stop`, `skull`, `x`                | Era-appropriate alert icon |
| `focusIndicator` | string | `underline`, `reverse_video`, `prefix_char` | How selection is shown     |

### 3.5 Full Example

```json
{
  "generated": "2026-04-15T12:00:00Z",
  "themes": {
    "default": {
      "id": "default",
      "name": "Default",
      "era": null,
      "terminalTheme": "default",
      "richBox": "ROUNDED",
      "inkBorder": "round",
      "bannerFont": "slant",
      "glyphSet": "unicode",
      "css": {
        "bg_app": "#12121e",
        "bg_surface": "#1a1a2e",
        "bg_elevated": "#1f1f31",
        "bg_deep": "#171726",
        "bg_sunken": "#101018",
        "fg_primary": "#e0e0e0",
        "fg_secondary": "#b4b4c3",
        "fg_muted": "#888888",
        "fg_dim": "#666666",
        "fg_faint": "#555555",
        "accent": "#da7756",
        "accent_hover": "rgba(218, 119, 86, 0.1)",
        "accent_danger": "#ff6b6b",
        "accent_success": "#4ade80",
        "border": "#2a2a3a",
        "border_strong": "#3a3a4a"
      },
      "ansi": {
        "background": "#12121e",
        "foreground": "#e0e0e0",
        "cursor": "#da7756",
        "black": "#000000",
        "red": "#ff6b6b",
        "green": "#4ade80",
        "yellow": "#da7756",
        "blue": "#6c5eb5",
        "magenta": "#9a8ed0",
        "cyan": "#5bc0de",
        "white": "#e0e0e0",
        "brightBlack": "#555555",
        "brightRed": "#ff8787",
        "brightGreen": "#6ee7a0",
        "brightYellow": "#e89070",
        "brightBlue": "#8a7ed0",
        "brightMagenta": "#b4a8e0",
        "brightCyan": "#7cd4ef",
        "brightWhite": "#ffffff"
      },
      "effects": {
        "bg_glow": null,
        "scanline_opacity": 0.0,
        "flicker_intensity": 0.0,
        "baud_rate": 0,
        "chromatic_aberration": 0
      },
      "loaderStyle": "dots",
      "errorIcon": "x",
      "focusIndicator": "underline"
    },
    "system6": {
      "id": "system6",
      "name": "System 6",
      "era": "1988",
      "richBox": "SQUARE",
      "inkBorder": "single",
      "bannerFont": "mini",
      "glyphSet": "ascii",
      "effects": {
        "bg_glow": null,
        "scanline_opacity": 0.0,
        "flicker_intensity": 0.0,
        "baud_rate": 0,
        "chromatic_aberration": 0
      },
      "loaderStyle": "classic",
      "errorIcon": "bomb",
      "focusIndicator": "reverse_video"
    },
    "c64": {
      "id": "c64",
      "name": "Commodore 64",
      "era": "1982",
      "richBox": "HEAVY",
      "inkBorder": "bold",
      "bannerFont": "block",
      "glyphSet": "petscii",
      "effects": {
        "bg_glow": "rgba(108,94,181,0.4)",
        "scanline_opacity": 0.08,
        "flicker_intensity": 0.02,
        "baud_rate": 0,
        "chromatic_aberration": 0
      },
      "loaderStyle": "classic",
      "errorIcon": "stop",
      "focusIndicator": "reverse_video"
    }
  }
}
```

**Key decisions:**

- `css` section: 16 CSS variables (added `accent_hover`), with `--` prefix stripped and hyphens replaced by underscores.
- `ansi` section: 16-colour ANSI palette from the mapped terminal theme's `xterm` object.
- `effects` section: sourced from the terminal theme's `effects` object + new era-specific metadata defined in the generator's per-theme config.
- Layout/interaction metadata: defined per-theme in the generator (not derivable from CSS).
- One entry per app theme (5 total: default, nes, win98, system6, c64).

---

## 4. Generator Script

**Scroll:** `scripts/generate-theme-snapshot.js`

Reads:

- `electron/renderer/themes/theme-registry.js` — app theme metadata + `terminalTheme` mapping
- `electron/renderer/themes/base.css` — default CSS variable values
- `electron/renderer/themes/adapter-*.css` — per-theme CSS variable overrides (parsed via regex, not a full CSS parser)
- `electron/renderer/terminal-themes.js` — ANSI palettes

Outputs:

- `data/theme_snapshot.json`

The script runs:

- Manually: `node scripts/generate-theme-snapshot.js`
- Automatically: as a pre-launch step in the Electron `main.js` startup (before spawning the Python server)

Parsing approach for adapter CSS: regex extraction of `--variable: #hexvalue` patterns from `:root[data-theme="<id>"]` blocks. This is sufficient because our adapters follow a strict single-block format.

---

## 5. Python Layer (Rich)

### 5.1 ThemeManager

**Scroll:** `theme_manager.py` (new, project root)

Responsibilities:

- Load `data/theme_snapshot.json` at import time
- Accept a theme ID (from config or environment variable `AGENTCHATTR_THEME`)
- Build a `rich.theme.Theme` mapping CSS hex values to Rich style names
- Provide a singleton `rich.console.Console` instance used globally

**Rich style mapping:**

| Rich style name    | Source               | Purpose                       |
| ------------------ | -------------------- | ----------------------------- |
| `ui.surface`       | `css.bg_surface`     | Panel backgrounds             |
| `ui.header`        | `css.bg_deep`        | Panel title bar backgrounds   |
| `ui.text`          | `css.fg_primary`     | Primary body text             |
| `ui.muted`         | `css.fg_muted`       | Secondary/dimmed text         |
| `ui.accent`        | `css.accent`         | Highlights, active indicators |
| `ui.success`       | `css.accent_success` | Success messages, connected   |
| `ui.danger`        | `css.accent_danger`  | Error messages, kill actions  |
| `ui.border`        | `css.border`         | Panel borders                 |
| `ui.border_strong` | `css.border_strong`  | Emphasised borders            |

Styles encode colour as `color` or `on color` (background) using Rich's hex colour syntax (e.g. `"#da7756"`, `"bold #ff6b6b on #1a1a2e"`).

### 5.2 Themed Console

**Scroll:** `theme_console.py` (new, project root)

A thin module providing:

- `console` — the global Rich Console instance (uses ThemeManager)
- `render_panel(title, content, style="ui.border")` — renders a Rich `Panel` styled like a system window
- `render_error(title, message)` — renders an error in a `Panel` with `ui.danger` border, styled like a system error dialogue
- `render_banner(info_dict)` — renders the startup banner using a Rich `Table` inside a `Panel`
- `render_security_warning(host)` — renders the security warning as a danger-styled panel

### 5.3 Box Style Per Theme

Each theme maps to a Rich `box` style that echoes its era:

| Theme   | Rich Box      | Rationale                           |
| ------- | ------------- | ----------------------------------- |
| default | `box.ROUNDED` | Modern, clean                       |
| nes     | `box.HEAVY`   | Bold pixel feel                     |
| win98   | `box.DOUBLE`  | Classic Windows double-line borders |
| system6 | `box.SQUARE`  | Minimal, monochrome Mac             |
| c64     | `box.HEAVY`   | PETSCII-inspired block characters   |

The box style is stored in the theme snapshot under a new `richBox` field.

### 5.4 Integration Points

Scrolls to modify (replace `print()` with themed Rich output):

| Scroll             | Lines         | What changes                                                                       |
| ------------------ | ------------- | ---------------------------------------------------------------------------------- |
| `run.py`           | 158-186       | Startup banner + security warning → `render_banner()`, `render_security_warning()` |
| `run.py`           | 181-186       | Server info block → `render_panel("agentchattr", ...)`                             |
| `run.py`           | 59            | Config error → `render_error()`                                                    |
| `mcp_proxy.py`     | 186, 204      | Port announcements → `console.print()` with `ui.accent`                            |
| `config_loader.py` | (print calls) | Duplicate agent warning → `render_error()`                                         |

**Logging integration:** Replace `logging.basicConfig()` in `run.py:50` with a `rich.logging.RichHandler` so all log output flows through the themed console. This gives us coloured log levels, timestamps, and module names automatically.

### 5.5 Error Dialogue Example

The `.bat` error from the screenshot (`The module 'windows' could not be loaded`) would render as:

```
╔══════════════════════════════════════════════╗
║  ⚠ PROCESS ERROR                            ║
╠══════════════════════════════════════════════╣
║                                              ║
║  The module 'windows' could not be loaded.   ║
║                                              ║
║  Source: start_claude_skip-permissions.bat    ║
║  For more information, run:                  ║
║    Import-Module windows                     ║
║                                              ║
╚══════════════════════════════════════════════╝
```

(Using `box.DOUBLE` for Win98 theme, `box.HEAVY` for C64, etc.)

---

## 6. Node.js Layer (Ink + Chalk)

### 6.1 Package Additions

Add to root `package.json`:

- `ink` (^5.x) — React-for-terminals renderer
- `ink-spinner` — loading indicators
- `react` (^18.x) — peer dependency for Ink

`chalk` v5.6.2 is already installed.

### 6.2 TUI Dashboard

**Scroll:** `tui/dashboard.jsx` (new directory `tui/`)

A multi-panel Ink application showing:

1. **Status Panel** — server ports (MCP HTTP, MCP SSE, Web UI), uptime, active theme name
2. **Log Stream Panel** — colour-coded scrolling log output from the Python process, filtered by level
3. **Agent Activity Panel** — connected agents, message counts, last activity timestamp

Layout: vertical stack of `<Box>` components, each with themed `borderStyle` and `borderColor` from the active palette.

### 6.3 Theme Integration

**Scroll:** `tui/theme.js` (new)

- Reads `data/theme_snapshot.json` at startup for the initial palette
- Listens for `app-theme-changed` IPC events (forwarded from Electron main process) to hot-swap the palette
- Exports a React context (`ThemeContext`) that all TUI components consume
- Maps CSS hex values to Chalk hex colour functions: `chalk.hex(theme.css.accent)("text")`

### 6.4 MacWindow Component

**Scroll:** `tui/components/MacWindow.jsx` (new)

A reusable Ink component that renders a bordered box with a coloured title bar:

```jsx
const MacWindow = ({ title, children, borderStyle = "round" }) => (
  <Box
    flexDirection="column"
    borderStyle={borderStyle}
    borderColor={theme.css.border}
  >
    <Box backgroundColor={theme.css.bg_deep} paddingX={1}>
      <Text color={theme.css.fg_primary} bold>
        {title}
      </Text>
    </Box>
    <Box padding={1}>{children}</Box>
  </Box>
);
```

Border style per theme (mirrors the Rich box mapping):

| Theme   | Ink borderStyle |
| ------- | --------------- |
| default | `round`         |
| nes     | `bold`          |
| win98   | `doubleSingle`  |
| system6 | `single`        |
| c64     | `bold`          |

### 6.5 Launch Integration

The TUI dashboard is an optional mode. Two launch paths:

1. **Electron launch** (normal): Python server starts headless, no TUI. Output goes to Electron's stdout buffer (existing behaviour).
2. **Standalone CLI**: `node tui/dashboard.jsx` — renders the Ink TUI in the user's terminal, connects to the running agentchattr server via HTTP to fetch status/logs. Useful for monitoring without the Electron shell.

The Electron embedded terminals can also render TUI components by injecting them into the xterm.js PTY stream, but this is a stretch goal — not in scope for v1.

---

## 7. Theme Bridge (IPC Enhancement)

### 7.1 Electron → Python: Theme Snapshot at Boot

**Scroll to modify:** `electron/main.js`

Before spawning the Python server (in `startServer()`), run the generator:

```javascript
// Generate fresh theme snapshot before Python boots
const { execFileSync } = require("child_process");
execFileSync("node", ["scripts/generate-theme-snapshot.js"], {
  cwd: REPO_ROOT,
});
```

Pass the active theme ID to Python via environment variable:

```javascript
// Read persisted theme from preferences (set by theme-picker in previous session)
const currentAppThemeId = preferences.get("appTheme") || "default";

serverProcess = spawn(pythonPath, ["run.py"], {
  cwd: REPO_ROOT,
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, AGENTCHATTR_THEME: currentAppThemeId },
});
```

### 7.2 Electron → Ink TUI: Live Theme Changes

The existing `app-theme-changed` IPC channel already broadcasts theme ID changes to all windows. The Ink TUI (when running inside an Electron terminal) receives these via the same channel and re-reads the relevant palette from its cached snapshot.

For the standalone CLI mode, the TUI polls `GET /api/theme` (a new endpoint returning the current theme ID + snapshot for that theme) every 30 seconds.

### 7.3 New API Endpoint

**Scroll to modify:** `app.py`

```python
@app.get("/api/theme")
async def get_theme():
    from theme_manager import get_current_theme
    return get_current_theme()
```

Returns the theme ID and its snapshot data. Lightweight, cacheable.

---

## 8. Scrolls Created / Modified

### New scrolls (7):

| Scroll                               | Purpose                                   |
| ------------------------------------ | ----------------------------------------- |
| `scripts/generate-theme-snapshot.js` | Build-time theme snapshot generator       |
| `data/theme_snapshot.json`           | Generated theme palette data (gitignored) |
| `theme_manager.py`                   | Python theme loading + Rich Theme builder |
| `theme_console.py`                   | Global Rich Console + rendering helpers   |
| `tui/dashboard.jsx`                  | Ink TUI dashboard entry point             |
| `tui/components/MacWindow.jsx`       | Reusable themed window component          |
| `tui/theme.js`                       | Ink theme context + IPC listener          |

### Modified scrolls (6):

| Scroll             | What changes                                               |
| ------------------ | ---------------------------------------------------------- |
| `run.py`           | Replace `print()` with Rich, add `RichHandler` for logging |
| `mcp_proxy.py`     | Replace `print()` with themed `console.print()`            |
| `config_loader.py` | Replace `print()` with `render_error()`                    |
| `electron/main.js` | Run generator before server spawn, pass theme env var      |
| `app.py`           | Add `GET /api/theme` endpoint                              |
| `package.json`     | Add `ink`, `react` dependencies                            |

---

## 9. Build Sequence

1. Install Python dependency: `pip install rich` (add to `requirements.txt`)
2. Install Node dependencies: `npm install ink react` (root `package.json`)
3. Create `scripts/generate-theme-snapshot.js`
4. Create `theme_manager.py` + `theme_console.py`
5. Modify `run.py` — replace all `print()` calls, add `RichHandler`
6. Modify `mcp_proxy.py` + `config_loader.py` — replace `print()` calls
7. Modify `electron/main.js` — generator pre-launch + env var
8. Add `GET /api/theme` to `app.py`
9. Create `tui/` directory with dashboard + components
10. Test: launch server standalone, verify themed Rich output
11. Test: launch via Electron, verify themed output in embedded terminal
12. Test: theme switching in Electron updates Ink TUI palette

---

## 10. Out of Scope (v1)

- Live theme switching in the Python process (requires restart)
- Injecting Ink components into xterm.js PTY stream
- Custom Rich box characters beyond the built-in box styles
- Theme-aware `process_manager.py` subprocess output formatting (the PTY ring buffer stays raw)
- Python-side Ink rendering (Python stays Rich-only)

---

## 11. Test Case: The `.bat` Error

The screenshot shows `start_claude_skip-permissions.bat` failing with:

> `The module 'windows' could not be loaded. For more information, run 'Import-Module windows'.`

This error originates from PowerShell inside a `.bat` script, not from the Python server. It appears in the xterm.js terminal pane. Two approaches:

1. **Watcher-engine integration** (recommended): The existing watcher engine in `terminal-manager.js` already scans PTY output for patterns. Add a rule matching `could not be loaded` errors and emit a bridge event. The Ink TUI's log stream panel renders these as themed error panels.

2. **Python-side**: If the error reaches the Python backend (via bridge POST), `render_error()` formats it as a themed Rich panel in the server log.

Both approaches are in scope. The watcher rule is the primary path since the error lives in the PTY stream.
