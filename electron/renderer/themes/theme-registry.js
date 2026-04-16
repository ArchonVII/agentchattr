"use strict";

/**
 * theme-registry.js — App-shell theme catalogue.
 *
 * Each entry describes an app-wide visual theme applied via CSS custom
 * properties in base.css.  Adapters are CSS files in the themes/ directory
 * that override the default variables via :root[data-theme="<id>"] selectors.
 *
 * Fields:
 *   id        {string}  — matches data-theme attribute value
 *   name      {string}  — human-readable label shown in the picker
 *   era       {string|null} — optional era label (e.g. "1984") for retro themes
 *   adapter   {string|null} — CSS filename relative to themes/ directory, or null
 *   font      {{ family, file, format }|null} — optional font to load
 *   terminalTheme {string} — recommended terminal theme id for new terminals
 */

/** @type {Array<{id:string, name:string, era:string|null, adapter:string|null, font:object|null}>} */
const APP_THEMES = [
  {
    id: "default",
    name: "Default",
    era: null,
    adapter: null,
    font: null,
    terminalTheme: "default",
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
    terminalTheme: "nes",
    preview: { bg: "#212529", fg: "#fff", accent: "#e76e55" },
  },
  {
    id: "win98",
    name: "Windows 98",
    era: "1998",
    adapter: "adapter-98.css",
    font: null,
    terminalTheme: "msdos",
    preview: { bg: "#008080", fg: "#000", accent: "#000080" },
  },
  {
    id: "winxp",
    name: "Windows XP",
    era: "2001",
    adapter: "adapter-xp.css",
    font: null,
    terminalTheme: "msdos",
    preview: { bg: "#3a6ea5", fg: "#0f172a", accent: "#245edb" },
  },
  {
    id: "system6",
    name: "System 6",
    era: "1988",
    adapter: "adapter-system.css",
    font: null,
    terminalTheme: "system6",
    preview: { bg: "#fff", fg: "#000", accent: "#000" },
  },
  {
    id: "classic",
    name: "Classic Mac",
    era: "1998",
    adapter: "adapter-classic.css",
    font: {
      family: "ChicagoFLF",
      file: "ChicagoFLF.ttf",
      format: "truetype",
    },
    terminalTheme: "system6",
    preview: { bg: "#bfbfbf", fg: "#111", accent: "#111" },
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
    terminalTheme: "c64",
    preview: { bg: "#352879", fg: "#6C5EB5", accent: "#6C5EB5" },
  },
  {
    id: "c64css3",
    name: "C64 CSS3",
    era: "1982",
    adapter: "adapter-c64css3.css",
    font: {
      family: "C64 User Mono",
      file: "C64_User_Mono_v1.0-STYLE.woff",
      format: "woff",
    },
    terminalTheme: "c64",
    preview: { bg: "#20398d", fg: "#6076c5", accent: "#6076c5" },
  },
  {
    id: "psone",
    name: "PlayStation",
    era: "1994",
    adapter: "adapter-psone.css",
    font: {
      family: "Final Fantasy Script Collection - Final Fantasy VII",
      file: "Final_Fantasy_VII.woff",
      format: "woff",
    },
    terminalTheme: "cyberpunk", // Cyberpunk fits the PS1 sci-fi aesthetic best
    preview: { bg: "#12151a", fg: "#fff", accent: "#5db2ff" },
  },
  {
    id: "cyberpunk",
    name: "Cyberpunk",
    era: "Neon",
    adapter: "adapter-cyberpunk.css",
    font: null,
    terminalTheme: "cyberpunk",
    preview: { bg: "#08111f", fg: "#d8f3ff", accent: "#ff4fd8" },
  },
  {
    id: "tui",
    name: "TuiCss",
    era: "DOS",
    adapter: "adapter-tui.css",
    font: {
      family: "Perfect DOS VGA 437 Win",
      file: "Perfect DOS VGA 437 Win.ttf",
      format: "truetype",
    },
    terminalTheme: "msdos",
    preview: { bg: "#0000aa", fg: "#fff", accent: "#ffff55" },
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return all registered app themes.
 * @returns {typeof APP_THEMES}
 */
function getAllAppThemes() {
  return APP_THEMES;
}

/**
 * Return a single theme by id, falling back to the default theme if not found.
 * @param {string} id
 * @returns {typeof APP_THEMES[0]}
 */
function getAppTheme(id) {
  return APP_THEMES.find((t) => t.id === id) ?? APP_THEMES[0];
}

module.exports = { getAllAppThemes, getAppTheme };
