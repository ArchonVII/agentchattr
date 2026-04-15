"use strict";

/**
 * terminal-themes.js — Rich terminal theme definitions for xterm.js 6.
 *
 * Each theme carries a full 16-colour ANSI palette, font config, cursor
 * style, optional CRT effects, chrome overrides, boot text, and layout
 * tuning.  The file is require()'d by terminals.js and bundled via esbuild.
 *
 * Fonts are WOFF files under electron/assets/fonts/.  The FontFace API is
 * available in Electron renderer processes without additional polyfills.
 */

// ---------------------------------------------------------------------------
// Font loader
// ---------------------------------------------------------------------------

/** Tracks already-loaded font families so we never double-load. */
const _loadedFonts = new Set();

/**
 * Load a WOFF font from the local assets/fonts directory via the FontFace API.
 * Resolves immediately if the font was loaded previously.
 *
 * @param {{ family: string, file: string, fallback?: string }} font
 * @returns {Promise<void>}
 */
async function loadThemeFont(font) {
  if (!font || !font.file) return;
  if (_loadedFonts.has(font.family)) return;

  try {
    // Relative path from renderer HTML — fonts live two levels up in assets/
    const url = `../assets/fonts/${font.file}`;
    const face = new FontFace(font.family, `url("${url}")`);
    await face.load();
    document.fonts.add(face);
    _loadedFonts.add(font.family);
  } catch (err) {
    // Non-fatal: xterm will fall back to the declared fallback/system font.
    console.warn(
      `[terminal-themes] Failed to load font "${font.family}":`,
      err,
    );
  }
}

// ---------------------------------------------------------------------------
// Theme registry
// ---------------------------------------------------------------------------

/**
 * THEMES — keyed by theme id.
 *
 * xterm colour palette fields follow the ITheme interface from xterm.js 6:
 *   background, foreground, cursor, cursorAccent, selectionBackground
 *   black … brightWhite  (the 16 ANSI colours)
 *
 * effects:
 *   glow   { enabled, color, radius }  — CSS text-shadow phosphor glow
 *   border { enabled, color, width }   — CSS border on the xterm container
 *
 * chrome:
 *   toolbarBg, buttonStyle ('default'|'bevel'|'pixel'), accentColor
 *
 * boot:
 *   lines  — string[] printed character-by-character on terminal open
 *   delay  — ms between characters (source: subjective retro-feel target)
 *
 * tuning:
 *   lineHeight, letterSpacing — xterm.js Terminal option values
 */
const THEMES = {
  // ── DEFAULT ─────────────────────────────────────────────────────────────
  default: {
    id: "default",
    name: "Default",
    era: null,
    xterm: {
      // Agentchattr dark palette — sourced from original terminal-config.js
      background: "#12121e",
      foreground: "#e0e0e0",
      cursor: "#da7756",
      cursorAccent: "#12121e",
      selectionBackground: "rgba(218,119,86,0.3)",
      // Standard xterm ANSI 16 — neutral dark variant
      black: "#1e1e2e",
      red: "#ff5555",
      green: "#50fa7b",
      yellow: "#f1fa8c",
      blue: "#6272a4",
      magenta: "#ff79c6",
      cyan: "#8be9fd",
      white: "#bfbfbf",
      brightBlack: "#4d4d4d",
      brightRed: "#ff6e6e",
      brightGreen: "#69ff94",
      brightYellow: "#ffffa5",
      brightBlue: "#d6acff",
      brightMagenta: "#ff92df",
      brightCyan: "#a4ffff",
      brightWhite: "#e0e0e0",
    },
    font: {
      family: "Consolas",
      file: null, // system font — no load needed
      fallback: "monospace",
      size: 14, // px; comfortable default — user instruction
    },
    cursor: {
      style: "bar", // xterm cursorStyle option
      blink: true,
    },
    effects: {
      glow: { enabled: false, color: null, radius: 0 },
      border: { enabled: false, color: null, width: 0 },
    },
    chrome: {
      toolbarBg: null,
      buttonStyle: "default",
      accentColor: "#da7756",
      tabIndicatorColor: "#da7756", // matches default accent — design spec
    },
    boot: { lines: [], delay: 0 },
    tuning: {
      lineHeight: 1.2, // xterm default — inherited baseline
      letterSpacing: 0, // xterm default — no extra spacing
    },
  },

  // ── CYBERPUNK ────────────────────────────────────────────────────────────
  cyberpunk: {
    id: "cyberpunk",
    name: "Cyberpunk",
    era: null,
    xterm: {
      // Sourced from original terminal-config.js
      background: "#000b1e",
      foreground: "#00ff9f",
      cursor: "#ff00ff",
      cursorAccent: "#000b1e",
      selectionBackground: "rgba(0,255,159,0.25)",
      black: "#0a0a1a",
      red: "#ff0055",
      green: "#00ff9f",
      yellow: "#ffee00",
      blue: "#0044ff",
      magenta: "#ff00ff",
      cyan: "#00e5ff",
      white: "#c8d8e8",
      brightBlack: "#1a2a3a",
      brightRed: "#ff4488",
      brightGreen: "#44ffbb",
      brightYellow: "#ffff55",
      brightBlue: "#4488ff",
      brightMagenta: "#ff55ff",
      brightCyan: "#55ffff",
      brightWhite: "#ffffff",
    },
    font: {
      family: "Consolas",
      file: null,
      fallback: "monospace",
      size: 14, // px; same as default — user instruction
    },
    cursor: { style: "bar", blink: true },
    effects: {
      glow: { enabled: false, color: null, radius: 0 },
      border: { enabled: false, color: null, width: 0 },
    },
    chrome: {
      toolbarBg: null,
      buttonStyle: "default",
      accentColor: "#ff00ff",
      tabIndicatorColor: "#ff00ff", // matches accent — design spec
    },
    boot: { lines: [], delay: 0 },
    tuning: {
      lineHeight: 1.2, // xterm default — inherited baseline
      letterSpacing: 0, // xterm default — no extra spacing
    },
  },

  // ── MATRIX ───────────────────────────────────────────────────────────────
  matrix: {
    id: "matrix",
    name: "Matrix",
    era: null,
    xterm: {
      // Sourced from original terminal-config.js
      background: "#0d0208",
      foreground: "#00ff41",
      cursor: "#00ff41",
      cursorAccent: "#0d0208",
      selectionBackground: "rgba(0,255,65,0.25)",
      black: "#0d0208",
      red: "#003b00",
      green: "#00ff41",
      yellow: "#008f11",
      blue: "#003b00",
      magenta: "#00b300",
      cyan: "#00cc33",
      white: "#00ff41",
      brightBlack: "#005500",
      brightRed: "#007700",
      brightGreen: "#33ff66",
      brightYellow: "#00dd33",
      brightBlue: "#008800",
      brightMagenta: "#00cc00",
      brightCyan: "#00ffaa",
      brightWhite: "#ccffcc",
    },
    font: {
      family: "Consolas",
      file: null,
      fallback: "monospace",
      size: 14, // px; same as default — user instruction
    },
    cursor: { style: "bar", blink: true },
    effects: {
      glow: { enabled: false, color: null, radius: 0 },
      border: { enabled: false, color: null, width: 0 },
    },
    chrome: {
      toolbarBg: null,
      buttonStyle: "default",
      accentColor: "#00ff41",
      tabIndicatorColor: "#00ff41", // matches accent — design spec
    },
    boot: { lines: [], delay: 0 },
    tuning: {
      lineHeight: 1.2, // xterm default — inherited baseline
      letterSpacing: 0, // xterm default — no extra spacing
    },
  },

  // ── DRACULA ──────────────────────────────────────────────────────────────
  dracula: {
    id: "dracula",
    name: "Dracula",
    era: null,
    xterm: {
      // Dracula palette — https://draculatheme.com/contribute (official spec)
      background: "#282a36",
      foreground: "#f8f8f2",
      cursor: "#ff79c6",
      cursorAccent: "#282a36",
      selectionBackground: "rgba(248,248,242,0.2)",
      black: "#21222c",
      red: "#ff5555",
      green: "#50fa7b",
      yellow: "#f1fa8c",
      blue: "#bd93f9",
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
    font: {
      family: "Consolas",
      file: null,
      fallback: "monospace",
      size: 14, // px; same as default — user instruction
    },
    cursor: { style: "bar", blink: true },
    effects: {
      glow: { enabled: false, color: null, radius: 0 },
      border: { enabled: false, color: null, width: 0 },
    },
    chrome: {
      toolbarBg: null,
      buttonStyle: "default",
      accentColor: "#ff79c6",
      tabIndicatorColor: "#ff79c6", // matches accent — design spec
    },
    boot: { lines: [], delay: 0 },
    tuning: {
      lineHeight: 1.2, // xterm default — inherited baseline
      letterSpacing: 0, // xterm default — no extra spacing
    },
  },

  // ── COMMODORE 64 ─────────────────────────────────────────────────────────
  c64: {
    id: "c64",
    name: "Commodore 64",
    era: "1982",
    xterm: {
      // C64 system colours — sourced from https://www.c64-wiki.com/wiki/Color
      // The C64 had a fixed 16-colour palette; these are the canonical hex
      // approximations widely used by emulators (VICE / Hoxs64 default).
      background: "#352879", // C64 colour 6 — blue (screen default)
      foreground: "#6C5EB5", // C64 colour 14 — light blue (text default)
      cursor: "#6C5EB5",
      cursorAccent: "#352879",
      selectionBackground: "rgba(108,94,181,0.35)",
      black: "#000000", // C64 colour 0
      red: "#68372B", // C64 colour 2  — red
      green: "#70A04B", // C64 colour 5  — green
      yellow: "#B8C76F", // C64 colour 7  — yellow
      blue: "#352879", // C64 colour 6  — blue
      magenta: "#6F3D86", // C64 colour 4  — purple
      cyan: "#588D43", // C64 colour 13 — dark green (nearest cyan)
      white: "#FFFFFF", // C64 colour 1
      brightBlack: "#3E3E3E", // C64 colour 11 — dark grey
      brightRed: "#9A6759", // C64 colour 10 — light red
      brightGreen: "#9AD284", // C64 colour 13 — light green
      brightYellow: "#FFFFB8", // extended; not a native C64 colour
      brightBlue: "#6C5EB5", // C64 colour 14 — light blue
      brightMagenta: "#A57FB9", // C64 colour 4  — light purple (extended)
      brightCyan: "#70B0CF", // C64 colour 3  — cyan
      brightWhite: "#B8B8B8", // C64 colour 15 — light grey
    },
    font: {
      family: "C64_Pro_Mono",
      file: "C64_Pro_Mono-STYLE.woff", // bundled in assets/fonts/ — source: Style (style64.org)
      fallback: "Web437_IBM_VGA_9x16", // fallback also needs loading
      size: 16, // px; matches C64 8×8 character cell scaled ×2 — user instruction
    },
    cursor: { style: "block", blink: true },
    effects: {
      glow: { enabled: false, color: "rgba(108,94,181,0.8)", radius: 5 }, // radius in px — user instruction
      border: { enabled: true, color: "#6C5EB5", width: 24 }, // border simulates C64 screen bezel — user instruction
    },
    chrome: {
      toolbarBg: "#2a2060",
      buttonStyle: "pixel",
      accentColor: "#6C5EB5",
      tabIndicatorColor: "#6C5EB5", // matches C64 border colour — design spec
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
      delay: 50, // ms per character — matches C64 ~2400 baud screen speed feel
    },
    tuning: {
      lineHeight: 1.4, // extra leading for authentic C64 raster spacing — user instruction
      letterSpacing: 1, // px; matches C64 proportional character spacing — user instruction
    },
  },

  // ── MS-DOS ───────────────────────────────────────────────────────────────
  msdos: {
    id: "msdos",
    name: "MS-DOS 3.30",
    era: "1987",
    xterm: {
      // Standard IBM VGA text-mode palette (CGA/EGA/VGA BIOS colours).
      // Sourced from: standard IBM VGA text-mode palette
      // Reference: https://en.wikipedia.org/wiki/Color_Graphics_Adapter#Color_palette
      background: "#000000",
      foreground: "#AAAAAA", // VGA light grey (attribute 7)
      cursor: "#AAAAAA",
      cursorAccent: "#000000",
      selectionBackground: "rgba(170,170,170,0.25)",
      black: "#000000", // VGA colour 0
      red: "#AA0000", // VGA colour 4
      green: "#00AA00", // VGA colour 2
      yellow: "#AA5500", // VGA colour 6  — brown
      blue: "#0000AA", // VGA colour 1
      magenta: "#AA00AA", // VGA colour 5
      cyan: "#00AAAA", // VGA colour 3
      white: "#AAAAAA", // VGA colour 7
      brightBlack: "#555555", // VGA colour 8  — dark grey
      brightRed: "#FF5555", // VGA colour 12
      brightGreen: "#55FF55", // VGA colour 10
      brightYellow: "#FFFF55", // VGA colour 14
      brightBlue: "#5555FF", // VGA colour 9
      brightMagenta: "#FF55FF", // VGA colour 13
      brightCyan: "#55FFFF", // VGA colour 11
      brightWhite: "#FFFFFF", // VGA colour 15
    },
    font: {
      family: "Web437_IBM_VGA_9x16",
      file: "Web437_IBM_VGA_9x16.woff",
      fallback: "monospace",
      size: 16, // px; matches VGA 9×16 character cell height — user instruction
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
      tabIndicatorColor: "#AAAAAA", // matches VGA light grey — design spec
    },
    boot: {
      lines: [
        "Microsoft(R) MS-DOS(R) Version 3.30",
        "(C)Copyright Microsoft Corp 1981-1987",
        "",
      ],
      delay: 40, // ms per character — user instruction
    },
    tuning: {
      lineHeight: 1.2, // standard VGA row spacing — user instruction
      letterSpacing: 0.5, // px; slight IBM VGA glyph gap — user instruction
    },
  },

  // ── APPLE IIe ────────────────────────────────────────────────────────────
  apple2: {
    id: "apple2",
    name: "Apple IIe",
    era: "1983",
    xterm: {
      // Apple II Reference Manual (1978) — the standard text mode uses a
      // single phosphor green on black.  The 16-slot ANSI palette is filled
      // with green-family hues to preserve the monochrome aesthetic while
      // still handling colour escape sequences sensibly.
      // Sourced from: Apple II Reference Manual
      background: "#000000",
      foreground: "#33FF33", // P1 phosphor green — canonical #33FF33
      cursor: "#33FF33",
      cursorAccent: "#000000",
      selectionBackground: "rgba(51,255,51,0.25)",
      black: "#000000",
      red: "#006600", // dark green — no red on monochrome display
      green: "#33FF33", // phosphor green
      yellow: "#00CC00", // mid green
      blue: "#004400", // very dark green
      magenta: "#00AA00", // medium green
      cyan: "#22DD22", // slightly lighter green
      white: "#33FF33",
      brightBlack: "#005500",
      brightRed: "#00BB00",
      brightGreen: "#66FF66",
      brightYellow: "#33CC33",
      brightBlue: "#009900",
      brightMagenta: "#00DD00",
      brightCyan: "#55FF55",
      brightWhite: "#AAFFAA",
    },
    font: {
      family: "PrintChar21",
      file: "PrintChar21.woff", // bundled in assets/fonts/ — source: Online Web Fonts
      fallback: "Web437_IBM_VGA_9x16",
      size: 16, // px — user instruction
    },
    cursor: { style: "block", blink: true },
    effects: {
      glow: { enabled: true, color: "rgba(51,255,51,0.8)", radius: 5 }, // phosphor glow — user instruction; radius in px
      border: { enabled: false, color: null, width: 0 },
    },
    chrome: {
      toolbarBg: "#0a1a0a",
      buttonStyle: "default",
      accentColor: "#33FF33",
      tabIndicatorColor: "#33FF33", // matches phosphor green — design spec
    },
    boot: {
      lines: ["APPLE ][", "", "]"],
      delay: 60, // ms per character — slower Applesoft BASIC prompt feel — user instruction
    },
    tuning: {
      lineHeight: 1.3, // Apple II 40-col row spacing approximation — user instruction
      letterSpacing: 0.5, // px — user instruction
    },
  },

  // ── AMBER CRT ────────────────────────────────────────────────────────────
  amber: {
    id: "amber",
    name: "CRT Amber",
    era: "1980s",
    xterm: {
      // Generic P3 phosphor amber monitors (IBM 5151, DEC VT100-series amber
      // variant).  Canonical phosphor amber is approximately #FFB000.
      // No single standards document; colour derived from photographic
      // references of period hardware — user instruction.
      background: "#0a0800",
      foreground: "#FFB000", // P3 amber phosphor — user instruction
      cursor: "#FFB000",
      cursorAccent: "#0a0800",
      selectionBackground: "rgba(255,176,0,0.25)",
      black: "#0a0800",
      red: "#663300", // dark amber-brown
      green: "#997700", // olive amber
      yellow: "#FFB000", // full amber
      blue: "#442200", // very dark amber
      magenta: "#BB6600", // warm amber-red
      cyan: "#CC8800", // light amber-gold
      white: "#FFB000",
      brightBlack: "#554400",
      brightRed: "#BB7700",
      brightGreen: "#DDAA00",
      brightYellow: "#FFCC44",
      brightBlue: "#886600",
      brightMagenta: "#FFAA55",
      brightCyan: "#FFD055",
      brightWhite: "#FFE080",
    },
    font: {
      family: "Web437_IBM_VGA_9x16",
      file: "Web437_IBM_VGA_9x16.woff",
      fallback: "monospace",
      size: 16, // px — user instruction
    },
    cursor: { style: "block", blink: true },
    effects: {
      glow: { enabled: true, color: "rgba(255,176,0,0.7)", radius: 5 }, // P3 phosphor afterglow — user instruction; radius in px
      border: { enabled: false, color: null, width: 0 },
    },
    chrome: {
      toolbarBg: "#1a1200",
      buttonStyle: "default",
      accentColor: "#FFB000",
      tabIndicatorColor: "#FFB000", // matches amber phosphor — design spec
    },
    boot: {
      lines: ["SYSTEM READY", ""],
      delay: 40, // ms per character — user instruction
    },
    tuning: {
      lineHeight: 1.3, // period CRT scanline spacing approximation — user instruction
      letterSpacing: 0.5, // px — user instruction
    },
  },

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
      red: "#e76e55", // NES red
      green: "#4aa52e", // NES green
      yellow: "#e8a33e", // NES gold
      blue: "#3a5fc4", // NES blue
      magenta: "#b53cc0", // NES purple
      cyan: "#4ac7c4", // NES cyan
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
      red: "#000000", // monochrome — all dark
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
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return a theme by id.  Falls back to 'default' if the id is unknown.
 *
 * @param {string} id
 * @returns {object}
 */
function getTheme(id) {
  return THEMES[id] || THEMES.default;
}

/**
 * Return the full theme registry object (shallow copy to prevent mutation).
 *
 * @returns {object}
 */
function getAllThemes() {
  return Object.assign({}, THEMES);
}

module.exports = { getTheme, getAllThemes, loadThemeFont };
