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
 */

/** @type {Array<{id:string, name:string, era:string|null, adapter:string|null, font:object|null}>} */
const APP_THEMES = [
  {
    id: "default",
    name: "Default",
    era: null,
    adapter: null,
    font: null,
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
    preview: { bg: "#212529", fg: "#fff", accent: "#e76e55" },
  },
  {
    id: "win98",
    name: "Windows 98",
    era: "1998",
    adapter: "adapter-98.css",
    font: null,
    preview: { bg: "#008080", fg: "#000", accent: "#000080" },
  },
  {
    id: "system6",
    name: "System 6",
    era: "1988",
    adapter: "adapter-system.css",
    font: null,
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
    preview: { bg: "#352879", fg: "#6C5EB5", accent: "#6C5EB5" },
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
