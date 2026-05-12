# CSS-to-ANSI Translation Layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Synchronise terminal output styling with the active Electron app theme by translating CSS variables into themed Rich (Python) and Ink/Chalk (Node.js) output.

**Architecture:** A build-time generator reads the theme registry, CSS adapters, and terminal-themes to produce `data/theme_snapshot.json`. Python loads this snapshot at boot via a `ThemeManager` and renders all output through a themed Rich console. A Node.js Ink TUI dashboard consumes the same snapshot and receives live theme-change events via IPC.

**Tech Stack:** Rich + pyfiglet (Python), Ink 5 + Chalk 5 + React 18 (Node.js), existing Electron IPC, existing CSS theme system.

**Spec:** `docs/superpowers/specs/2026-04-15-css-to-ansi-translation-layer-design.md`

---

## File Map

### New files

| File | Responsibility |
|------|---------------|
| `scripts/generate-theme-snapshot.js` | Reads theme-registry.js, base.css, adapter-*.css, terminal-themes.js → writes `data/theme_snapshot.json` |
| `theme_manager.py` | Loads snapshot, builds Rich Theme, exposes singleton Console |
| `theme_console.py` | Rendering helpers: `render_panel`, `render_error`, `render_banner`, `render_security_warning` |
| `tests/test_theme_manager.py` | Unit tests for ThemeManager |
| `tests/test_theme_console.py` | Unit tests for rendering helpers |
| `tests/test_generate_snapshot.js` | Smoke test for the generator script |
| `tui/package.json` | Ink/React dependencies scoped to the TUI |
| `tui/theme.js` | Load snapshot, export theme context + Chalk palette helpers |
| `tui/components/MacWindow.jsx` | Reusable bordered-box component with themed title bar |
| `tui/dashboard.jsx` | Multi-panel TUI entry point (Status, Logs, Agent Activity) |

### Modified files

| File | What changes |
|------|-------------|
| `requirements.txt` | Add `rich>=13.0`, `pyfiglet>=1.0` |
| `run.py` | Replace all `print()` with Rich, swap `logging.basicConfig` for `RichHandler` |
| `mcp_proxy.py:312,319` | Replace `print()` with themed `console.print()` |
| `config_loader.py:41` | Replace `print()` with themed `console.print()` |
| `app.py` | Add `GET /api/theme` endpoint |
| `electron/main.js:384-389` | Run generator before spawn, pass `AGENTCHATTR_THEME` env var |
| `package.json` | Add `ink`, `react`, `ink-spinner` to dependencies |
| `.gitignore` | Add `data/theme_snapshot.json` |

---

## Task 1: Theme Snapshot Generator

**Files:**
- Create: `scripts/generate-theme-snapshot.js`
- Create: `tests/test_generate_snapshot.js`

This is the foundation — everything else reads its output.

- [ ] **Step 1: Create the scripts directory**

```bash
mkdir -p scripts
```

- [ ] **Step 2: Write the generator script**

Create `scripts/generate-theme-snapshot.js`:

```javascript
"use strict";

/**
 * generate-theme-snapshot.js — Reads the Electron theme system and produces
 * data/theme_snapshot.json for consumption by Python (Rich) and Node (Ink/Chalk).
 *
 * Run: node scripts/generate-theme-snapshot.js
 * Source: CSS-to-ANSI Translation Layer spec, Section 4.
 */

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const REGISTRY_PATH = path.join(REPO_ROOT, "electron", "renderer", "themes", "theme-registry.js");
const BASE_CSS_PATH = path.join(REPO_ROOT, "electron", "renderer", "themes", "base.css");
const ADAPTERS_DIR = path.join(REPO_ROOT, "electron", "renderer", "themes");
const TERMINAL_THEMES_PATH = path.join(REPO_ROOT, "electron", "renderer", "terminal-themes.js");
const OUTPUT_PATH = path.join(REPO_ROOT, "data", "theme_snapshot.json");

// CSS variables we extract (16 values for ANSI mapping).
// Source: spec Section 3.1 — core CSS palette.
const CSS_VARS = [
  "bg-app", "bg-surface", "bg-elevated", "bg-deep", "bg-sunken",
  "fg-primary", "fg-secondary", "fg-muted", "fg-dim", "fg-faint",
  "accent", "accent-hover-bg", "accent-danger", "accent-success",
  "border", "border-strong",
];

// ANSI palette keys we extract from terminal-themes.js xterm objects.
// Source: xterm.js ITheme interface.
const ANSI_KEYS = [
  "background", "foreground", "cursor",
  "black", "red", "green", "yellow", "blue", "magenta", "cyan", "white",
  "brightBlack", "brightRed", "brightGreen", "brightYellow",
  "brightBlue", "brightMagenta", "brightCyan", "brightWhite",
];

// Rich box style per theme.
// Source: spec Section 5.3 — box style per theme.
const RICH_BOX = {
  default: "ROUNDED",
  nes: "HEAVY",
  win98: "DOUBLE",
  system6: "SQUARE",
  c64: "HEAVY",
};

// Ink border style per theme.
// Source: spec Section 6.4 — border style per theme.
const INK_BORDER = {
  default: "round",
  nes: "bold",
  win98: "doubleSingle",
  system6: "single",
  c64: "bold",
};

// ---------------------------------------------------------------------------
// Era metadata — not derivable from CSS, defined per-theme here.
// Source: spec Section 3.2 (layout), 3.3 (effects), 3.4 (interaction).
// ---------------------------------------------------------------------------

const ERA_META = {
  default: {
    bannerFont: "slant",
    glyphSet: "unicode",
    effects: {
      bg_glow: null,
      scanline_opacity: 0.0,
      flicker_intensity: 0.0,
      baud_rate: 0,
      chromatic_aberration: 0,
    },
    loaderStyle: "dots",
    errorIcon: "x",
    focusIndicator: "underline",
  },
  nes: {
    bannerFont: "block",
    glyphSet: "ascii",
    effects: {
      bg_glow: null,
      scanline_opacity: 0.0,
      flicker_intensity: 0.0,
      baud_rate: 0,
      chromatic_aberration: 0,
    },
    loaderStyle: "classic",
    errorIcon: "stop",
    focusIndicator: "reverse_video",
  },
  win98: {
    bannerFont: "banner3",
    glyphSet: "ascii",
    effects: {
      bg_glow: null,
      scanline_opacity: 0.0,
      flicker_intensity: 0.0,
      baud_rate: 0,
      chromatic_aberration: 0,
    },
    loaderStyle: "classic",
    errorIcon: "stop",
    focusIndicator: "underline",
  },
  system6: {
    bannerFont: "mini",
    glyphSet: "ascii",
    effects: {
      bg_glow: null,
      scanline_opacity: 0.0,
      flicker_intensity: 0.0,
      baud_rate: 0,
      chromatic_aberration: 0,
    },
    loaderStyle: "classic",
    errorIcon: "bomb",
    focusIndicator: "reverse_video",
  },
  c64: {
    bannerFont: "block",
    glyphSet: "petscii",
    effects: {
      bg_glow: "rgba(108,94,181,0.4)",
      scanline_opacity: 0.08,
      flicker_intensity: 0.02,
      baud_rate: 0,
      chromatic_aberration: 0,
    },
    loaderStyle: "classic",
    errorIcon: "stop",
    focusIndicator: "reverse_video",
  },
};

/**
 * Parse CSS custom property values from a CSS string.
 * Only extracts --<name>: #<hex>; patterns (our adapters are strict).
 * @param {string} css
 * @returns {Map<string, string>} variable name (without --) → hex value
 */
function parseCssVars(css) {
  const vars = new Map();
  // Match --variable-name: #hexvalue (3, 4, 6, or 8 hex digits)
  const re = /--([\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\b/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    vars.set(m[1], m[2]);
  }
  return vars;
}

/**
 * Load the app theme registry via require().
 * @returns {Array<{id, name, era, terminalTheme, preview}>}
 */
function loadRegistry() {
  // Clear require cache so re-runs pick up edits
  delete require.cache[require.resolve(REGISTRY_PATH)];
  const { getAllAppThemes } = require(REGISTRY_PATH);
  return getAllAppThemes();
}

/**
 * Load terminal themes via require().
 * The module exports THEMES as a property on module.exports or via getTheme().
 * We need the raw THEMES object — it's not exported directly, so we read the
 * file and extract using a sandboxed require.
 */
function loadTerminalThemes() {
  delete require.cache[require.resolve(TERMINAL_THEMES_PATH)];
  const mod = require(TERMINAL_THEMES_PATH);
  // terminal-themes.js exports: getTheme, getAllThemes, loadThemeFont
  if (typeof mod.getAllThemes === "function") {
    return mod.getAllThemes();
  }
  // Fallback: the THEMES constant might be exported directly
  if (mod.THEMES) return mod.THEMES;
  throw new Error("Cannot read terminal themes — no getAllThemes() or THEMES export");
}

function main() {
  // 1. Load base CSS defaults
  const baseCss = fs.readFileSync(BASE_CSS_PATH, "utf-8");
  const baseVars = parseCssVars(baseCss);

  // 2. Load the app theme registry
  const appThemes = loadRegistry();

  // 3. Load terminal themes (for ANSI palettes)
  const terminalThemes = loadTerminalThemes();

  // 4. Build snapshot
  const snapshot = {
    generated: new Date().toISOString(),
    themes: {},
  };

  for (const appTheme of appThemes) {
    // Start with base CSS defaults, then overlay adapter overrides
    const cssValues = new Map(baseVars);

    if (appTheme.adapter) {
      const adapterPath = path.join(ADAPTERS_DIR, appTheme.adapter);
      if (fs.existsSync(adapterPath)) {
        const adapterCss = fs.readFileSync(adapterPath, "utf-8");
        const overrides = parseCssVars(adapterCss);
        for (const [k, v] of overrides) {
          cssValues.set(k, v);
        }
      }
    }

    // Build css section (16 vars)
    const css = {};
    for (const varName of CSS_VARS) {
      // Convert "bg-app" → "bg_app" for JSON/Python friendliness
      const key = varName.replace(/-/g, "_");
      css[key] = cssValues.get(varName) || null;
    }

    // Build ansi section from the mapped terminal theme
    const ansi = {};
    const termThemeId = appTheme.terminalTheme || "default";
    const termTheme = terminalThemes[termThemeId] || terminalThemes.default;
    if (termTheme && termTheme.xterm) {
      for (const key of ANSI_KEYS) {
        const val = termTheme.xterm[key];
        // Skip rgba values — only keep hex for ANSI mapping
        if (typeof val === "string" && val.startsWith("#")) {
          ansi[key] = val;
        }
      }
    }

    // Merge era metadata (layout, effects, interaction)
    const era = ERA_META[appTheme.id] || ERA_META.default;

    snapshot.themes[appTheme.id] = {
      id: appTheme.id,
      name: appTheme.name,
      era: appTheme.era || null,
      terminalTheme: termThemeId,
      richBox: RICH_BOX[appTheme.id] || "ROUNDED",
      inkBorder: INK_BORDER[appTheme.id] || "round",
      bannerFont: era.bannerFont,
      glyphSet: era.glyphSet,
      css,
      ansi,
      effects: era.effects,
      loaderStyle: era.loaderStyle,
      errorIcon: era.errorIcon,
      focusIndicator: era.focusIndicator,
    };
  }

  // 5. Write output
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(snapshot, null, 2) + "\n", "utf-8");

  const themeCount = Object.keys(snapshot.themes).length;
  console.log(`theme_snapshot.json: ${themeCount} themes written to ${OUTPUT_PATH}`);
}

main();
```

- [ ] **Step 3: Check if terminal-themes.js exports getAllThemes**

```bash
grep -n "getAllThemes\|module\.exports" electron/renderer/terminal-themes.js | tail -10
```

If `getAllThemes` is not exported, add it to the module.exports at the bottom of `electron/renderer/terminal-themes.js`:

```javascript
function getAllThemes() {
  return THEMES;
}

// Add to existing module.exports:
module.exports = { THEMES, getTheme, getAllThemes, loadThemeFont };
```

- [ ] **Step 4: Run the generator and verify output**

```bash
node scripts/generate-theme-snapshot.js
```

Expected: `theme_snapshot.json: 5 themes written to <path>/data/theme_snapshot.json`

Verify contents:

```bash
node -e "const s = require('./data/theme_snapshot.json'); console.log(Object.keys(s.themes)); console.log(s.themes.c64.css.bg_app); console.log(s.themes.c64.ansi.background)"
```

Expected:
```
[ 'default', 'nes', 'win98', 'system6', 'c64' ]
#352879
<hex value from c64 terminal theme>
```

- [ ] **Step 5: Write a smoke test for the generator**

Create `tests/test_generate_snapshot.js`:

```javascript
"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(REPO_ROOT, "data", "theme_snapshot.json");

// Clean any existing snapshot to prove the script creates it fresh
if (fs.existsSync(OUTPUT)) fs.unlinkSync(OUTPUT);

execFileSync("node", ["scripts/generate-theme-snapshot.js"], { cwd: REPO_ROOT });

const snapshot = JSON.parse(fs.readFileSync(OUTPUT, "utf-8"));

// Basic structure checks
console.assert(snapshot.generated, "missing generated timestamp");
console.assert(snapshot.themes, "missing themes object");

const ids = Object.keys(snapshot.themes);
console.assert(ids.length >= 5, `expected >=5 themes, got ${ids.length}`);

for (const id of ["default", "nes", "win98", "system6", "c64"]) {
  const t = snapshot.themes[id];
  console.assert(t, `missing theme: ${id}`);
  // Core palettes
  console.assert(t.css.bg_app, `${id}: missing css.bg_app`);
  console.assert(t.css.fg_primary, `${id}: missing css.fg_primary`);
  console.assert(t.css.accent, `${id}: missing css.accent`);
  console.assert(t.ansi.background, `${id}: missing ansi.background`);
  console.assert(t.ansi.foreground, `${id}: missing ansi.foreground`);
  // Layout metadata
  console.assert(t.richBox, `${id}: missing richBox`);
  console.assert(t.inkBorder, `${id}: missing inkBorder`);
  console.assert(t.bannerFont, `${id}: missing bannerFont`);
  console.assert(t.glyphSet, `${id}: missing glyphSet`);
  // Effects
  console.assert(t.effects !== undefined, `${id}: missing effects`);
  console.assert(typeof t.effects.scanline_opacity === "number", `${id}: scanline_opacity not a number`);
  console.assert(typeof t.effects.baud_rate === "number", `${id}: baud_rate not a number`);
  // Interaction
  console.assert(t.loaderStyle, `${id}: missing loaderStyle`);
  console.assert(t.errorIcon, `${id}: missing errorIcon`);
  console.assert(t.focusIndicator, `${id}: missing focusIndicator`);
}

// Verify C64 gets its specific overrides (not the base defaults)
console.assert(
  snapshot.themes.c64.css.bg_app === "#352879",
  `c64 bg_app should be #352879, got ${snapshot.themes.c64.css.bg_app}`
);
// Verify C64 era metadata
console.assert(
  snapshot.themes.c64.glyphSet === "petscii",
  `c64 glyphSet should be petscii, got ${snapshot.themes.c64.glyphSet}`
);
console.assert(
  snapshot.themes.c64.effects.scanline_opacity === 0.08,
  `c64 scanline_opacity should be 0.08`
);
console.assert(
  snapshot.themes.system6.errorIcon === "bomb",
  `system6 errorIcon should be bomb`
);

console.log("PASS: theme snapshot generator produces valid output");
```

- [ ] **Step 6: Run the smoke test**

```bash
node tests/test_generate_snapshot.js
```

Expected: `PASS: theme snapshot generator produces valid output`

- [ ] **Step 7: Add theme_snapshot.json to .gitignore**

Append to `.gitignore`:

```
data/theme_snapshot.json
```

- [ ] **Step 8: Commit**

```bash
git add scripts/generate-theme-snapshot.js tests/test_generate_snapshot.js .gitignore
git commit -m "feat(themes): add CSS-to-ANSI theme snapshot generator

Reads theme-registry.js, base.css, adapter-*.css, and terminal-themes.js
to produce data/theme_snapshot.json with CSS hex values and ANSI palettes
for all 5 app themes."
```

---

## Task 2: Python ThemeManager

**Files:**
- Create: `theme_manager.py`
- Create: `tests/test_theme_manager.py`
- Modify: `requirements.txt`

Depends on: Task 1 (needs `data/theme_snapshot.json` to exist).

- [ ] **Step 1: Add Rich to requirements.txt**

Modify `requirements.txt` — append:

```
rich>=13.0
pyfiglet>=1.0
```

- [ ] **Step 2: Install dependencies**

```bash
pip install "rich>=13.0" "pyfiglet>=1.0"
```

- [ ] **Step 3: Write the failing test**

Create `tests/test_theme_manager.py`:

```python
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


def test_load_snapshot_returns_all_themes():
    """ThemeManager loads the snapshot and has entries for all 5 app themes."""
    from theme_manager import ThemeManager

    tm = ThemeManager()
    for theme_id in ("default", "nes", "win98", "system6", "c64"):
        theme = tm.get_theme_data(theme_id)
        assert theme is not None, f"missing theme: {theme_id}"
        assert "css" in theme
        assert "ansi" in theme
        assert theme["css"]["bg_app"] is not None


def test_get_rich_theme_returns_theme_object():
    """get_rich_theme() returns a rich.theme.Theme with our custom styles."""
    from theme_manager import ThemeManager

    tm = ThemeManager()
    rich_theme = tm.get_rich_theme("c64")
    # Rich Theme stores styles in a dict-like .styles attribute
    assert "ui.surface" in rich_theme.styles
    assert "ui.accent" in rich_theme.styles
    assert "ui.danger" in rich_theme.styles


def test_get_console_returns_console_instance():
    """get_console() returns a Rich Console wired to the theme."""
    from theme_manager import ThemeManager
    from rich.console import Console

    tm = ThemeManager()
    console = tm.get_console("default")
    assert isinstance(console, Console)


def test_default_theme_from_env(monkeypatch):
    """ThemeManager reads AGENTCHATTR_THEME env var for default theme."""
    monkeypatch.setenv("AGENTCHATTR_THEME", "win98")
    from theme_manager import ThemeManager

    tm = ThemeManager()
    assert tm.active_theme_id == "win98"


def test_fallback_to_default_on_missing_env(monkeypatch):
    """ThemeManager falls back to 'default' when env var is not set."""
    monkeypatch.delenv("AGENTCHATTR_THEME", raising=False)
    from theme_manager import ThemeManager

    tm = ThemeManager()
    assert tm.active_theme_id == "default"


def test_get_box_style():
    """get_box_style() returns the correct Rich box constant name."""
    from theme_manager import ThemeManager

    tm = ThemeManager()
    assert tm.get_box_style("c64") == "HEAVY"
    assert tm.get_box_style("win98") == "DOUBLE"
    assert tm.get_box_style("default") == "ROUNDED"


def test_era_metadata_accessible():
    """Era metadata fields are accessible from the theme data."""
    from theme_manager import ThemeManager

    tm = ThemeManager()
    data = tm.get_theme_data("c64")
    assert data["bannerFont"] == "block"
    assert data["glyphSet"] == "petscii"
    assert data["effects"]["scanline_opacity"] == 0.08
    assert data["loaderStyle"] == "classic"
    assert data["errorIcon"] == "stop"
    assert data["focusIndicator"] == "reverse_video"


def test_error_icon():
    """Each theme has an era-appropriate error icon."""
    from theme_manager import ThemeManager

    tm = ThemeManager()
    assert tm.get_theme_data("system6")["errorIcon"] == "bomb"
    assert tm.get_theme_data("default")["errorIcon"] == "x"
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
python -m pytest tests/test_theme_manager.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'theme_manager'`

- [ ] **Step 5: Write theme_manager.py**

Create `theme_manager.py`:

```python
"""ThemeManager — loads theme_snapshot.json and builds Rich themes.

Converts CSS hex values from the Electron theme system into Rich style
objects for themed terminal output.

Source: CSS-to-ANSI Translation Layer spec, Section 5.1.
"""

import json
import os
from pathlib import Path

from rich.console import Console
from rich.theme import Theme

ROOT = Path(__file__).parent
SNAPSHOT_PATH = ROOT / "data" / "theme_snapshot.json"

# Rich box style names per theme.
# Source: spec Section 5.3.
_BOX_STYLES = {
    "default": "ROUNDED",
    "nes": "HEAVY",
    "win98": "DOUBLE",
    "system6": "SQUARE",
    "c64": "HEAVY",
}


class ThemeManager:
    """Loads the theme snapshot and builds Rich Theme objects."""

    def __init__(self, snapshot_path: Path | None = None):
        self._path = snapshot_path or SNAPSHOT_PATH
        self._snapshot = self._load()
        self.active_theme_id = os.environ.get("AGENTCHATTR_THEME", "default")

    def _load(self) -> dict:
        if not self._path.exists():
            return {"themes": {}}
        return json.loads(self._path.read_text("utf-8"))

    def get_theme_data(self, theme_id: str) -> dict | None:
        """Return raw theme data dict for a given theme ID."""
        return self._snapshot.get("themes", {}).get(theme_id)

    def get_rich_theme(self, theme_id: str | None = None) -> Theme:
        """Build a Rich Theme from the snapshot's CSS hex values.

        Maps CSS variables to Rich style names using hex colour syntax.
        Source: spec Section 5.1 — style mapping table.
        """
        tid = theme_id or self.active_theme_id
        data = self.get_theme_data(tid)
        if not data:
            data = self.get_theme_data("default") or {"css": {}}

        css = data.get("css", {})
        styles = {
            "ui.surface": css.get("bg_surface", "#1a1a2e"),
            "ui.header": f"bold {css.get('fg_primary', '#e0e0e0')} on {css.get('bg_deep', '#171726')}",
            "ui.text": css.get("fg_primary", "#e0e0e0"),
            "ui.muted": css.get("fg_muted", "#888888"),
            "ui.accent": f"bold {css.get('accent', '#da7756')}",
            "ui.success": f"bold {css.get('accent_success', '#4ade80')}",
            "ui.danger": f"bold {css.get('accent_danger', '#ff6b6b')}",
            "ui.border": css.get("border", "#2a2a3a"),
            "ui.border_strong": css.get("border_strong", "#3a3a4a"),
        }
        return Theme(styles)

    def get_console(self, theme_id: str | None = None) -> Console:
        """Return a Rich Console instance wired to the given theme."""
        rich_theme = self.get_rich_theme(theme_id)
        return Console(theme=rich_theme)

    def get_box_style(self, theme_id: str | None = None) -> str:
        """Return the Rich box constant name for the theme.

        Source: spec Section 5.3 — box style per theme.
        """
        tid = theme_id or self.active_theme_id
        data = self.get_theme_data(tid)
        if data and "richBox" in data:
            return data["richBox"]
        return _BOX_STYLES.get(tid, "ROUNDED")

    def get_error_icon(self, theme_id: str | None = None) -> str:
        """Return the era-appropriate error icon string.

        Source: spec Section 3.4 — interaction metadata.
        """
        tid = theme_id or self.active_theme_id
        data = self.get_theme_data(tid)
        if data:
            return data.get("errorIcon", "x")
        return "x"

    def get_banner_font(self, theme_id: str | None = None) -> str:
        """Return the FIGlet font name for the startup banner.

        Source: spec Section 3.2 — layout metadata.
        """
        tid = theme_id or self.active_theme_id
        data = self.get_theme_data(tid)
        if data:
            return data.get("bannerFont", "slant")
        return "slant"

    def get_effects(self, theme_id: str | None = None) -> dict:
        """Return the effects dict for the theme.

        Source: spec Section 3.3 — CRT simulation.
        """
        tid = theme_id or self.active_theme_id
        data = self.get_theme_data(tid)
        if data:
            return data.get("effects", {})
        return {}

    def get_current_theme(self) -> dict:
        """Return the active theme's full data (for the /api/theme endpoint)."""
        data = self.get_theme_data(self.active_theme_id)
        return {
            "id": self.active_theme_id,
            "theme": data,
        }


# Module-level singleton — imported by theme_console.py and other modules.
_manager: ThemeManager | None = None


def get_manager() -> ThemeManager:
    """Return the singleton ThemeManager, creating it on first call."""
    global _manager
    if _manager is None:
        _manager = ThemeManager()
    return _manager


def get_current_theme() -> dict:
    """Convenience wrapper for the /api/theme endpoint."""
    return get_manager().get_current_theme()
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
python -m pytest tests/test_theme_manager.py -v
```

Expected: all 6 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add theme_manager.py tests/test_theme_manager.py requirements.txt
git commit -m "feat(themes): add Python ThemeManager for Rich theme building

Loads data/theme_snapshot.json, maps CSS hex values to Rich styles,
and provides a singleton Console instance for themed terminal output."
```

---

## Task 3: Python Themed Console Helpers

**Files:**
- Create: `theme_console.py`
- Create: `tests/test_theme_console.py`

Depends on: Task 2.

- [ ] **Step 1: Write the failing test**

Create `tests/test_theme_console.py`:

```python
import sys
from pathlib import Path
from io import StringIO

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


def test_console_is_a_rich_console():
    """The module-level console is a Rich Console instance."""
    from theme_console import console
    from rich.console import Console

    assert isinstance(console, Console)


def test_render_panel_produces_output():
    """render_panel() writes to the console without crashing."""
    from theme_console import render_panel
    from rich.console import Console
    from io import StringIO

    buf = StringIO()
    test_console = Console(file=buf, force_terminal=True, width=60)
    render_panel("Test Title", "Test content", console=test_console)
    output = buf.getvalue()
    assert "Test Title" in output
    assert "Test content" in output


def test_render_error_produces_output():
    """render_error() writes a danger-styled panel."""
    from theme_console import render_error
    from rich.console import Console
    from io import StringIO

    buf = StringIO()
    test_console = Console(file=buf, force_terminal=True, width=60)
    render_error("PROCESS ERROR", "The module 'windows' could not be loaded.", console=test_console)
    output = buf.getvalue()
    assert "PROCESS ERROR" in output
    assert "windows" in output


def test_render_banner_produces_output():
    """render_banner() renders server info in a panel."""
    from theme_console import render_banner
    from rich.console import Console
    from io import StringIO

    buf = StringIO()
    test_console = Console(file=buf, force_terminal=True, width=80)
    info = {
        "host": "127.0.0.1",
        "port": 8300,
        "http_port": 8200,
        "sse_port": 8201,
        "session_token": "abc123",
        "label": "deadbeef - main/JAgentchattr - 2026-04-15",
    }
    render_banner(info, console=test_console)
    output = buf.getvalue()
    assert "8300" in output
    assert "8200" in output


def test_render_security_warning_produces_output():
    """render_security_warning() renders a danger panel."""
    from theme_console import render_security_warning
    from rich.console import Console
    from io import StringIO

    buf = StringIO()
    test_console = Console(file=buf, force_terminal=True, width=80)
    render_security_warning("0.0.0.0", console=test_console)
    output = buf.getvalue()
    assert "SECURITY" in output.upper()
    assert "0.0.0.0" in output
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m pytest tests/test_theme_console.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'theme_console'`

- [ ] **Step 3: Write theme_console.py**

Create `theme_console.py`:

```python
"""theme_console — Global Rich console + themed rendering helpers.

Provides a pre-configured Rich Console and convenience functions for
rendering panels, errors, banners, and warnings using the active theme.

Source: CSS-to-ANSI Translation Layer spec, Section 5.2.
"""

from rich import box as rich_box
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from theme_manager import get_manager

try:
    import pyfiglet
except ImportError:
    pyfiglet = None

# ---------------------------------------------------------------------------
# Box style resolver
# ---------------------------------------------------------------------------

_BOX_MAP = {
    "ROUNDED": rich_box.ROUNDED,
    "HEAVY": rich_box.HEAVY,
    "DOUBLE": rich_box.DOUBLE,
    "SQUARE": rich_box.SQUARE,
}


def _get_box():
    """Return the Rich box object for the active theme."""
    name = get_manager().get_box_style()
    return _BOX_MAP.get(name, rich_box.ROUNDED)


# ---------------------------------------------------------------------------
# Module-level console singleton
# ---------------------------------------------------------------------------

console: Console = get_manager().get_console()


# ---------------------------------------------------------------------------
# Rendering helpers
# ---------------------------------------------------------------------------


def render_panel(title: str, content: str, style: str = "ui.border",
                 console: Console | None = None):
    """Render a themed Rich Panel.

    Args:
        title: Panel title (displayed in the border).
        content: Body text.
        style: Rich style name for the border.
        console: Override console (for testing). Uses module singleton if None.
    """
    c = console or globals()["console"]
    c.print(Panel(
        content,
        title=f"[ui.accent]{title}[/ui.accent]",
        border_style=style,
        box=_get_box(),
        expand=False,
        padding=(1, 2),
    ))


def _error_icon_char() -> str:
    """Return the era-appropriate error icon character.

    Source: spec Section 3.4 — interaction metadata.
    """
    icon_map = {
        "bomb": "\U0001F4A3",    # 💣 — System 6
        "stop": "\U0001F6D1",    # 🛑 — Win98, C64
        "skull": "\U00002620",   # ☠  — Hacker/BBS
        "x": "\u2716",          # ✖  — Default (modern)
    }
    icon_name = get_manager().get_error_icon()
    return icon_map.get(icon_name, "\u2716")


def render_error(title: str, message: str, console: Console | None = None):
    """Render a themed error dialogue panel with era-appropriate icon.

    Styled with ui.danger border to look like a system error window.
    Source: spec Section 5.5.
    """
    c = console or globals()["console"]
    icon = _error_icon_char()
    c.print(Panel(
        f"[ui.danger]{message}[/ui.danger]",
        title=f"[ui.danger]{icon} {title}[/ui.danger]",
        border_style="ui.danger",
        box=_get_box(),
        expand=False,
        padding=(1, 2),
    ))


def render_banner(info: dict, console: Console | None = None):
    """Render the server startup banner with FIGlet art and a details table.

    Uses the active theme's bannerFont for the ASCII art header.
    Args:
        info: Dict with keys: host, port, http_port, sse_port, session_token, label.
    Source: spec Section 5.4 — replaces the plain print() block in run.py.
    """
    c = console or globals()["console"]

    # FIGlet banner — falls back to plain text if pyfiglet unavailable
    banner_font = get_manager().get_banner_font()
    if pyfiglet:
        try:
            art = pyfiglet.figlet_format("agentchattr", font=banner_font)
            c.print(f"[ui.accent]{art}[/ui.accent]", highlight=False)
        except Exception:
            c.print("[ui.accent]agentchattr[/ui.accent]")
    else:
        c.print("[ui.accent]agentchattr[/ui.accent]")

    table = Table(show_header=False, box=None, padding=(0, 2))
    table.add_column("key", style="ui.muted")
    table.add_column("value", style="ui.text")

    table.add_row("Web UI", f"http://{info['host']}:{info['port']}")
    table.add_row("MCP HTTP", f"http://{info['host']}:{info['http_port']}/mcp")
    table.add_row("MCP SSE", f"http://{info['host']}:{info['sse_port']}/sse")
    table.add_row("Build", info.get("label", ""))
    table.add_row("Token", info.get("session_token", ""))

    c.print(Panel(
        table,
        subtitle="[ui.muted]agents auto-trigger on @mention[/ui.muted]",
        border_style="ui.accent",
        box=_get_box(),
        expand=False,
        padding=(1, 2),
    ))
    c.print()


def render_security_warning(host: str, console: Console | None = None):
    """Render the security warning as a danger-styled panel.

    Source: spec Section 5.4 — replaces the plain print() block in run.py.
    """
    c = console or globals()["console"]

    warning_text = (
        f"[ui.danger]Binding to {host}[/ui.danger]\n"
        "This exposes agentchattr to your local network.\n\n"
        "[ui.text]Risks:[/ui.text]\n"
        "  - No TLS: traffic (including session token) is plaintext\n"
        "  - Anyone on your network can sniff the token and gain full access\n"
        "  - With the token, anyone can @mention agents and trigger tool execution\n"
        "  - If agents run with auto-approve, this means remote code execution\n\n"
        "Only use this on a trusted home network. Never on public/shared WiFi."
    )

    c.print()
    c.print(Panel(
        warning_text,
        title="[ui.danger]SECURITY WARNING[/ui.danger]",
        border_style="ui.danger",
        box=_get_box(),
        expand=False,
        padding=(1, 2),
    ))
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
python -m pytest tests/test_theme_console.py -v
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add theme_console.py tests/test_theme_console.py
git commit -m "feat(themes): add themed Rich console rendering helpers

Provides render_panel, render_error, render_banner, render_security_warning
using the active theme's colours and box style."
```

---

## Task 4: Replace Python print() Calls with Rich Output

**Files:**
- Modify: `run.py:50-54` (logging setup)
- Modify: `run.py:59` (config error)
- Modify: `run.py:157-186` (security warning + banner)
- Modify: `mcp_proxy.py:312,319` (port announcements)
- Modify: `config_loader.py:41` (duplicate agent warning)

Depends on: Task 3.

- [ ] **Step 1: Modify run.py — replace logging.basicConfig with RichHandler**

In `run.py`, replace lines 50-54:

```python
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
        datefmt="%H:%M:%S",
    )
```

With:

```python
    from rich.logging import RichHandler
    from theme_console import console as rich_console

    logging.basicConfig(
        level=logging.INFO,
        format="%(message)s",
        datefmt="[%H:%M:%S]",
        handlers=[RichHandler(
            console=rich_console,
            rich_tracebacks=True,
            show_path=False,
        )],
    )
```

- [ ] **Step 2: Modify run.py — replace config error print**

In `run.py`, replace line 59:

```python
        print(f"Error: {config_path} not found")
```

With:

```python
        from theme_console import render_error
        render_error("CONFIG ERROR", f"{config_path} not found")
```

- [ ] **Step 3: Modify run.py — replace security warning block**

In `run.py`, replace lines 157-179 (the security warning block):

```python
    if host not in ("127.0.0.1", "localhost", "::1"):
        print(f"\n  !! SECURITY WARNING — binding to {host} !!")
        print("  This exposes agentchattr to your local network.")
        print()
        print("  Risks:")
        print("  - No TLS: traffic (including session token) is plaintext")
        print("  - Anyone on your network can sniff the token and gain full access")
        print("  - With the token, anyone can @mention agents and trigger tool execution")
        print("  - If agents run with auto-approve, this means remote code execution")
        print()
        print("  Only use this on a trusted home network. Never on public/shared WiFi.")
        if "--allow-network" not in sys.argv:
            print("  Pass --allow-network to start anyway, or set host to 127.0.0.1.\n")
            sys.exit(1)
        else:
            print()
            try:
                confirm = input("  Type YES to accept these risks and start: ").strip()
            except (EOFError, KeyboardInterrupt):
                confirm = ""
            if confirm != "YES":
                print("  Aborted.\n")
                sys.exit(1)
```

With:

```python
    if host not in ("127.0.0.1", "localhost", "::1"):
        from theme_console import render_security_warning, render_error, console as rich_console

        render_security_warning(host)
        if "--allow-network" not in sys.argv:
            rich_console.print("[ui.muted]  Pass --allow-network to start anyway, or set host to 127.0.0.1.[/ui.muted]")
            sys.exit(1)
        else:
            try:
                confirm = input("  Type YES to accept these risks and start: ").strip()
            except (EOFError, KeyboardInterrupt):
                confirm = ""
            if confirm != "YES":
                render_error("ABORTED", "User declined network binding.")
                sys.exit(1)
```

- [ ] **Step 4: Modify run.py — replace startup banner**

In `run.py`, replace lines 181-186:

```python
    print(f"\n  agentchattr")
    print(f"  Web UI:  http://{host}:{port}")
    print(f"  MCP HTTP: http://{host}:{http_port}/mcp  (Claude, Codex)")
    print(f"  MCP SSE:  http://{host}:{sse_port}/sse   (Gemini)")
    print(f"  Agents auto-trigger on @mention")
    print(f"\n  Session token: {session_token}\n")
```

With:

```python
    from theme_console import render_banner
    render_banner({
        "host": host,
        "port": port,
        "http_port": http_port,
        "sse_port": sse_port,
        "session_token": session_token,
        "label": _app_module.build_info.get("label", ""),
    })
```

- [ ] **Step 5: Modify mcp_proxy.py — replace print() calls**

In `mcp_proxy.py`, replace line 312:

```python
                print(f"  MCP proxy: port {self._port} in use (shared with another instance)")
```

With:

```python
                from theme_console import console as rich_console
                rich_console.print(f"  [ui.muted]MCP proxy: port {self._port} in use (shared with another instance)[/ui.muted]")
```

In `mcp_proxy.py`, replace line 319:

```python
        print(f"  MCP proxy: port {self.port}")
```

With:

```python
        from theme_console import console as rich_console
        rich_console.print(f"  [ui.accent]MCP proxy:[/ui.accent] port {self.port}")
```

- [ ] **Step 6: Modify config_loader.py — replace print() call**

In `config_loader.py`, replace line 41:

```python
                print(f"  Warning: Ignoring local agent '{name}' (already defined in config.toml)")
```

With:

```python
                from theme_console import console as rich_console
                rich_console.print(f"  [ui.danger]Warning:[/ui.danger] Ignoring local agent '[ui.accent]{name}[/ui.accent]' (already defined in config.toml)")
```

- [ ] **Step 7: Test the server starts with themed output**

```bash
cd C:/AI/JAgentchattr && python run.py
```

Expected: The startup banner appears in a bordered Rich panel. Log messages have coloured level indicators. Ctrl+C to stop.

- [ ] **Step 8: Commit**

```bash
git add run.py mcp_proxy.py config_loader.py
git commit -m "feat(themes): replace plain print() with themed Rich output

Startup banner, security warning, config errors, and proxy announcements
now render through the themed Rich console with styled panels and colours."
```

---

## Task 5: Add /api/theme Endpoint

**Files:**
- Modify: `app.py`

Depends on: Task 2.

- [ ] **Step 1: Add the endpoint to app.py**

Add the following after the existing route definitions in `app.py` (after the imports and before the WebSocket handlers). Find a suitable location near other `@app.get` routes:

```python
@app.get("/api/theme")
async def get_theme():
    """Return the active theme ID and its snapshot data.

    Source: CSS-to-ANSI Translation Layer spec, Section 7.3.
    """
    from theme_manager import get_current_theme
    return get_current_theme()
```

- [ ] **Step 2: Test the endpoint**

Start the server, then in another terminal:

```bash
curl -s http://127.0.0.1:8300/api/theme | python -m json.tool | head -20
```

Expected: JSON with `"id"` and `"theme"` keys, where `theme` contains `css` and `ansi` sections.

- [ ] **Step 3: Commit**

```bash
git add app.py
git commit -m "feat(themes): add GET /api/theme endpoint

Returns the active theme ID and its full CSS/ANSI snapshot data
for consumption by the Ink TUI dashboard."
```

---

## Task 6: Wire Generator into Electron Startup

**Files:**
- Modify: `electron/main.js:384-389`

Depends on: Task 1.

- [ ] **Step 1: Modify startServer() in electron/main.js**

In `electron/main.js`, replace lines 384-389 (the `startServer` function body):

```javascript
function startServer(pythonPath) {
  serverExited = false;
  serverProcess = spawn(pythonPath, ["run.py"], {
    cwd: REPO_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
```

With:

```javascript
function startServer(pythonPath) {
  serverExited = false;

  // Generate fresh theme snapshot before Python boots.
  // Source: CSS-to-ANSI spec Section 7.1.
  try {
    const { execFileSync } = require("child_process");
    execFileSync("node", ["scripts/generate-theme-snapshot.js"], {
      cwd: REPO_ROOT,
      timeout: 5000,
    });
  } catch (err) {
    console.warn("Theme snapshot generation failed (non-fatal):", err.message);
  }

  // Pass the active theme to Python via environment variable.
  // Source: CSS-to-ANSI spec Section 7.1.
  const currentAppThemeId = preferences ? (preferences.get("appTheme") || "default") : "default";

  serverProcess = spawn(pythonPath, ["run.py"], {
    cwd: REPO_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, AGENTCHATTR_THEME: currentAppThemeId },
  });
```

- [ ] **Step 2: Test Electron launch**

```bash
cd electron && npm start
```

Expected: The app launches normally. Check the terminal for `theme_snapshot.json: 5 themes written` message during startup (it will be in Electron's stdout).

- [ ] **Step 3: Commit**

```bash
git add electron/main.js
git commit -m "feat(themes): wire snapshot generator into Electron startup

Generates data/theme_snapshot.json before spawning the Python server
and passes the active theme ID via AGENTCHATTR_THEME env var."
```

---

## Task 7: Install Ink/React Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install Ink and React**

```bash
cd C:/AI/JAgentchattr && npm install ink@^5 react@^18 ink-spinner
```

- [ ] **Step 2: Verify package.json updated**

```bash
node -e "const p = require('./package.json'); console.log(Object.keys(p.dependencies).sort())"
```

Expected: Array includes `chalk`, `chalk-cli`, `ink`, `ink-spinner`, `react`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add ink, react, ink-spinner for TUI dashboard"
```

---

## Task 8: TUI Theme Module

**Files:**
- Create: `tui/theme.js`

Depends on: Task 1, Task 7.

- [ ] **Step 1: Create the tui directory**

```bash
mkdir -p tui/components
```

- [ ] **Step 2: Write tui/theme.js**

Create `tui/theme.js`:

```javascript
"use strict";

/**
 * tui/theme.js — Theme context for the Ink TUI dashboard.
 *
 * Loads data/theme_snapshot.json and provides:
 *   - getThemePalette(themeId) — returns { css, ansi, inkBorder } for a theme
 *   - useTheme() — React hook returning the active palette + chalk helpers
 *   - ThemeProvider — React context provider for the active theme
 *
 * Source: CSS-to-ANSI Translation Layer spec, Section 6.3.
 */

import React, { createContext, useContext, useState, useCallback } from "react";
import chalk from "chalk";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = path.join(__dirname, "..", "data", "theme_snapshot.json");

/**
 * Load the theme snapshot from disk.
 * @returns {object} The full snapshot object.
 */
function loadSnapshot() {
  try {
    return JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf-8"));
  } catch {
    return { themes: {} };
  }
}

const snapshot = loadSnapshot();

/**
 * Return the palette for a specific theme.
 * @param {string} themeId
 * @returns {{ css: object, ansi: object, inkBorder: string, richBox: string }}
 */
export function getThemePalette(themeId) {
  return snapshot.themes[themeId] || snapshot.themes.default || {};
}

/**
 * Build Chalk helper functions from a theme palette.
 * @param {object} palette — from getThemePalette()
 * @returns {object} Named chalk functions + era metadata accessors
 */
function buildChalkHelpers(palette) {
  const css = palette.css || {};
  return {
    accent: chalk.hex(css.accent || "#da7756"),
    danger: chalk.hex(css.accent_danger || "#ff6b6b"),
    success: chalk.hex(css.accent_success || "#4ade80"),
    muted: chalk.hex(css.fg_muted || "#888888"),
    text: chalk.hex(css.fg_primary || "#e0e0e0"),
    header: chalk.bgHex(css.bg_deep || "#171726").hex(css.fg_primary || "#e0e0e0").bold,
    surface: chalk.bgHex(css.bg_surface || "#1a1a2e"),
  };
}

// Error icon mapping — matches theme_console.py _error_icon_char().
// Source: spec Section 3.4.
const ERROR_ICONS = {
  bomb: "\u{1F4A3}",
  stop: "\u{1F6D1}",
  skull: "\u2620",
  x: "\u2716",
};

/**
 * Return the era-appropriate error icon for a palette.
 * @param {object} palette
 * @returns {string}
 */
export function getErrorIcon(palette) {
  return ERROR_ICONS[palette.errorIcon] || "\u2716";
}

/**
 * Return the Ink spinner type for a palette's loaderStyle.
 * Source: spec Section 3.4.
 * @param {object} palette
 * @returns {string} Ink spinner type name
 */
export function getSpinnerType(palette) {
  const map = { dots: "dots", classic: "line", meter: "dots" };
  return map[palette.loaderStyle] || "dots";
}

// ---------------------------------------------------------------------------
// React context
// ---------------------------------------------------------------------------

const ThemeContext = createContext(null);

/**
 * ThemeProvider — wraps children with the active theme palette.
 *
 * @param {{ themeId: string, children: React.ReactNode }} props
 */
export function ThemeProvider({ themeId = "default", children }) {
  const [activeId, setActiveId] = useState(themeId);
  const palette = getThemePalette(activeId);
  const chalkHelpers = buildChalkHelpers(palette);

  const switchTheme = useCallback((newId) => {
    setActiveId(newId);
  }, []);

  const value = {
    id: activeId,
    palette,
    chalk: chalkHelpers,
    errorIcon: getErrorIcon(palette),
    spinnerType: getSpinnerType(palette),
    switchTheme,
  };

  return React.createElement(ThemeContext.Provider, { value }, children);
}

/**
 * useTheme() — React hook returning the active theme context.
 * @returns {{ id: string, palette: object, chalk: object, switchTheme: function }}
 */
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme() must be used inside a <ThemeProvider>");
  }
  return ctx;
}
```

- [ ] **Step 3: Verify it parses without errors**

```bash
node --input-type=module -e "import { getThemePalette } from './tui/theme.js'; console.log(getThemePalette('c64').css.bg_app)"
```

Expected: `#352879`

- [ ] **Step 4: Commit**

```bash
git add tui/theme.js
git commit -m "feat(tui): add theme context module for Ink dashboard

Loads theme_snapshot.json and provides React context, Chalk helpers,
and palette access for the Ink TUI components."
```

---

## Task 9: MacWindow Ink Component

**Files:**
- Create: `tui/components/MacWindow.jsx`

Depends on: Task 8.

- [ ] **Step 1: Write the MacWindow component**

Create `tui/components/MacWindow.jsx`:

```jsx
/**
 * MacWindow — Reusable themed window component for the Ink TUI.
 *
 * Renders a bordered box with a coloured title bar, styled per the
 * active theme's inkBorder and CSS palette.
 *
 * Source: CSS-to-ANSI Translation Layer spec, Section 6.4.
 */

import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../theme.js";

export default function MacWindow({ title, children, width }) {
  const { palette } = useTheme();
  const css = palette.css || {};
  const borderStyle = palette.inkBorder || "round";

  return (
    <Box
      flexDirection="column"
      borderStyle={borderStyle}
      borderColor={css.border || "#2a2a3a"}
      width={width}
    >
      <Box paddingX={1}>
        <Text bold color={css.accent || "#da7756"}>
          {title}
        </Text>
      </Box>
      <Box paddingX={1} flexDirection="column">
        {children}
      </Box>
    </Box>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add tui/components/MacWindow.jsx
git commit -m "feat(tui): add MacWindow themed box component

Reusable Ink component with border style and colours from the active
theme palette. Used by the TUI dashboard panels."
```

---

## Task 10: Ink TUI Dashboard

**Files:**
- Create: `tui/dashboard.jsx`

Depends on: Task 8, Task 9.

- [ ] **Step 1: Write the dashboard entry point**

Create `tui/dashboard.jsx`:

```jsx
#!/usr/bin/env node

/**
 * tui/dashboard.jsx — Ink TUI dashboard for agentchattr.
 *
 * Multi-panel terminal UI showing server status, logs, and agent activity.
 * Connects to the running agentchattr server via HTTP.
 *
 * Usage: node --loader tsx tui/dashboard.jsx [--theme <id>]
 *   or:  npx tsx tui/dashboard.jsx [--theme <id>]
 *
 * Source: CSS-to-ANSI Translation Layer spec, Section 6.2.
 */

import React, { useState, useEffect } from "react";
import { render, Box, Text, Newline } from "ink";
import Spinner from "ink-spinner";
import { ThemeProvider, useTheme } from "./theme.js";
import MacWindow from "./components/MacWindow.jsx";

// ---------------------------------------------------------------------------
// Parse CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const themeIdx = args.indexOf("--theme");
const initialTheme = themeIdx !== -1 && args[themeIdx + 1] ? args[themeIdx + 1] : (process.env.AGENTCHATTR_THEME || "default");

// Server base URL.
// Source: run.py default port.
const SERVER_PORT = process.env.AGENTCHATTR_PORT || 8300;
const BASE_URL = `http://127.0.0.1:${SERVER_PORT}`;

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function fetchJson(urlPath) {
  try {
    const resp = await fetch(`${BASE_URL}${urlPath}`);
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function StatusPanel() {
  const { chalk: c } = useTheme();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const poll = async () => {
      const data = await fetchJson("/api/theme");
      if (data) {
        setStatus(data);
        setLoading(false);
      }
    };
    poll();
    // Poll every 10 seconds. Source: lightweight — just theme metadata.
    const timer = setInterval(poll, 10000);
    return () => clearInterval(timer);
  }, []);

  return (
    <MacWindow title="STATUS">
      {loading ? (
        <Text>
          <Spinner type="dots" /> Connecting to server...
        </Text>
      ) : (
        <Box flexDirection="column">
          <Text>
            {c.muted("Theme:")} {c.accent(status?.id || "unknown")}
          </Text>
          <Text>
            {c.muted("Server:")} {c.success(`http://127.0.0.1:${SERVER_PORT}`)}
          </Text>
        </Box>
      )}
    </MacWindow>
  );
}

function AgentPanel() {
  const { chalk: c } = useTheme();
  const [agents, setAgents] = useState([]);

  useEffect(() => {
    const poll = async () => {
      const data = await fetchJson("/api/agents");
      if (data && Array.isArray(data)) {
        setAgents(data);
      }
    };
    poll();
    // Poll every 5 seconds. Source: agent list updates are infrequent.
    const timer = setInterval(poll, 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <MacWindow title="AGENTS">
      {agents.length === 0 ? (
        <Text>{c.muted("No agents connected")}</Text>
      ) : (
        <Box flexDirection="column">
          {agents.map((agent, i) => (
            <Text key={i}>
              {c.accent(agent.name || agent)} {c.muted(agent.status || "")}
            </Text>
          ))}
        </Box>
      )}
    </MacWindow>
  );
}

function LogPanel() {
  const { chalk: c } = useTheme();

  return (
    <MacWindow title="LOGS">
      <Text>{c.muted("Log streaming — coming in v2")}</Text>
      <Text>{c.muted("Use the Electron terminal pane for live logs")}</Text>
    </MacWindow>
  );
}

function Dashboard() {
  const { chalk: c, palette } = useTheme();

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold>
          {c.accent("agentchattr")} {c.muted("TUI Dashboard")}
          {palette.name ? c.muted(` — ${palette.name}`) : ""}
        </Text>
      </Box>
      <StatusPanel />
      <Newline />
      <AgentPanel />
      <Newline />
      <LogPanel />
      <Newline />
      <Text>{c.muted("Press Ctrl+C to exit")}</Text>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

render(
  <ThemeProvider themeId={initialTheme}>
    <Dashboard />
  </ThemeProvider>
);
```

- [ ] **Step 2: Test the TUI renders**

First ensure the agentchattr server is running, then:

```bash
npx tsx tui/dashboard.jsx --theme c64
```

Expected: A multi-panel TUI appears with Status, Agents, and Logs panels styled in the C64 palette. Status panel shows the connected theme. Press Ctrl+C to exit.

If `tsx` is not installed:

```bash
npm install -D tsx
npx tsx tui/dashboard.jsx --theme c64
```

- [ ] **Step 3: Commit**

```bash
git add tui/dashboard.jsx
git commit -m "feat(tui): add Ink TUI dashboard with themed panels

Multi-panel terminal UI showing server status, agent activity, and log
placeholder. Styled from the theme snapshot with per-theme border styles."
```

---

## Task 11: Integration Test — End-to-End Theme Flow

**Files:** No new files — manual verification.

Depends on: All previous tasks.

- [ ] **Step 1: Regenerate the snapshot**

```bash
node scripts/generate-theme-snapshot.js
```

- [ ] **Step 2: Run Python tests**

```bash
python -m pytest tests/test_theme_manager.py tests/test_theme_console.py -v
```

Expected: All tests pass.

- [ ] **Step 3: Run generator test**

```bash
node tests/test_generate_snapshot.js
```

Expected: `PASS: theme snapshot generator produces valid output`

- [ ] **Step 4: Test Python server with C64 theme**

```bash
$env:AGENTCHATTR_THEME = "c64"; python run.py
```

Expected: Startup banner renders in a `HEAVY`-bordered Rich panel with C64 purple colours. Log messages are colour-coded. Ctrl+C to stop.

- [ ] **Step 5: Test Python server with Win98 theme**

```bash
$env:AGENTCHATTR_THEME = "win98"; python run.py
```

Expected: Startup banner renders in a `DOUBLE`-bordered Rich panel with Win98 teal colours. Ctrl+C to stop.

- [ ] **Step 6: Test Electron launch**

```bash
cd electron && npm start
```

Expected: The Electron app launches. The Python server output (visible in Electron's console or an embedded terminal) shows themed Rich panels.

- [ ] **Step 7: Test TUI dashboard**

With the server running:

```bash
npx tsx tui/dashboard.jsx --theme default
```

Expected: Dashboard renders with rounded borders and the default dark palette.

- [ ] **Step 8: Final commit — update .gitignore if needed**

Verify `data/theme_snapshot.json` is gitignored:

```bash
git status data/theme_snapshot.json
```

If it shows as untracked, the .gitignore entry from Task 1 Step 7 is working. No action needed.
