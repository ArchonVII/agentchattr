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
const REGISTRY_PATH = path.join(
  REPO_ROOT,
  "electron",
  "renderer",
  "themes",
  "theme-registry.js",
);
const BASE_CSS_PATH = path.join(
  REPO_ROOT,
  "electron",
  "renderer",
  "themes",
  "base.css",
);
const ADAPTERS_DIR = path.join(REPO_ROOT, "electron", "renderer", "themes");
const TERMINAL_THEMES_PATH = path.join(
  REPO_ROOT,
  "electron",
  "renderer",
  "terminal-themes.js",
);
const OUTPUT_PATH = path.join(REPO_ROOT, "data", "theme_snapshot.json");

// CSS variables we extract (16 values for ANSI mapping).
// Source: spec Section 3.1 — core CSS palette.
const CSS_VARS = [
  "bg-app",
  "bg-surface",
  "bg-elevated",
  "bg-deep",
  "bg-sunken",
  "fg-primary",
  "fg-secondary",
  "fg-muted",
  "fg-dim",
  "fg-faint",
  "accent",
  "accent-hover-bg",
  "accent-danger",
  "accent-success",
  "border",
  "border-strong",
];

// ANSI palette keys we extract from terminal-themes.js xterm objects.
// Source: xterm.js ITheme interface.
const ANSI_KEYS = [
  "background",
  "foreground",
  "cursor",
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "brightBlack",
  "brightRed",
  "brightGreen",
  "brightYellow",
  "brightBlue",
  "brightMagenta",
  "brightCyan",
  "brightWhite",
];

// Rich box style per theme.
// Source: spec Section 5.3 — box style per theme.
const RICH_BOX = {
  default: "ROUNDED",
  nes: "HEAVY",
  win98: "DOUBLE",
  winxp: "ROUNDED",
  system6: "SQUARE",
  classic: "SQUARE",
  c64: "HEAVY",
  c64css3: "HEAVY",
  psone: "HEAVY",
  cyberpunk: "HEAVY",
  tui: "SQUARE",
};

// Ink border style per theme.
// Source: spec Section 6.4 — border style per theme.
const INK_BORDER = {
  default: "round",
  nes: "bold",
  win98: "doubleSingle",
  winxp: "round",
  system6: "single",
  classic: "single",
  c64: "bold",
  c64css3: "bold",
  psone: "bold",
  cyberpunk: "bold",
  tui: "single",
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
  winxp: {
    bannerFont: "banner3-D",
    glyphSet: "unicode",
    effects: {
      bg_glow: null,
      scanline_opacity: 0.0,
      flicker_intensity: 0.0,
      baud_rate: 0,
      chromatic_aberration: 0,
    },
    loaderStyle: "dots",
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
  classic: {
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
  c64css3: {
    bannerFont: "block",
    glyphSet: "petscii",
    effects: {
      bg_glow: "rgba(96,118,197,0.35)",
      scanline_opacity: 0.08,
      flicker_intensity: 0.02,
      baud_rate: 0,
      chromatic_aberration: 0,
    },
    loaderStyle: "classic",
    errorIcon: "stop",
    focusIndicator: "reverse_video",
  },
  psone: {
    bannerFont: "speed",
    glyphSet: "ascii",
    effects: {
      bg_glow: "rgba(93,178,255,0.3)",
      scanline_opacity: 0.05,
      flicker_intensity: 0.01,
      baud_rate: 0,
      chromatic_aberration: 0,
    },
    loaderStyle: "classic",
    errorIcon: "stop",
    focusIndicator: "reverse_video",
  },
  cyberpunk: {
    bannerFont: "speed",
    glyphSet: "unicode",
    effects: {
      bg_glow: "rgba(255,79,216,0.28)",
      scanline_opacity: 0.04,
      flicker_intensity: 0.01,
      baud_rate: 0,
      chromatic_aberration: 0,
    },
    loaderStyle: "dots",
    errorIcon: "stop",
    focusIndicator: "reverse_video",
  },
  tui: {
    bannerFont: "banner3",
    glyphSet: "ascii",
    effects: {
      bg_glow: null,
      scanline_opacity: 0.1,
      flicker_intensity: 0.0,
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
  delete require.cache[require.resolve(REGISTRY_PATH)];
  const { getAllAppThemes } = require(REGISTRY_PATH);
  return getAllAppThemes();
}

/**
 * Load terminal themes via require().
 */
function loadTerminalThemes() {
  delete require.cache[require.resolve(TERMINAL_THEMES_PATH)];
  const mod = require(TERMINAL_THEMES_PATH);
  if (typeof mod.getAllThemes === "function") {
    return mod.getAllThemes();
  }
  if (mod.THEMES) return mod.THEMES;
  throw new Error(
    "Cannot read terminal themes — no getAllThemes() or THEMES export",
  );
}

function main() {
  const baseCss = fs.readFileSync(BASE_CSS_PATH, "utf-8");
  const baseVars = parseCssVars(baseCss);
  const appThemes = loadRegistry();
  const terminalThemes = loadTerminalThemes();

  const snapshot = {
    generated: new Date().toISOString(),
    themes: {},
  };

  for (const appTheme of appThemes) {
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

    const css = {};
    for (const varName of CSS_VARS) {
      const key = varName.replace(/-/g, "_");
      css[key] = cssValues.get(varName) || null;
    }

    const ansi = {};
    const termThemeId = appTheme.terminalTheme || "default";
    const termTheme = terminalThemes[termThemeId] || terminalThemes.default;
    if (termTheme && termTheme.xterm) {
      for (const key of ANSI_KEYS) {
        const val = termTheme.xterm[key];
        if (typeof val === "string" && val.startsWith("#")) {
          ansi[key] = val;
        }
      }
    }

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

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(
    OUTPUT_PATH,
    JSON.stringify(snapshot, null, 2) + "\n",
    "utf-8",
  );

  const themeCount = Object.keys(snapshot.themes).length;
  console.log(
    `theme_snapshot.json: ${themeCount} themes written to ${OUTPUT_PATH}`,
  );
}

main();
