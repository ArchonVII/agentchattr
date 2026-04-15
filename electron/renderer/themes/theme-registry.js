"use strict";

/**
 * theme-registry.js — Metadata for all available app-wide themes.
 *
 * Each entry describes a theme's identity, adapter CSS path, font
 * requirements, and preview colours for the settings panel.
 *
 * Adding a new theme = adding one entry here + one adapter CSS file.
 */

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

/**
 * Get a theme entry by id. Falls back to 'default'.
 * @param {string} id
 * @returns {object}
 */
function getAppTheme(id) {
  return APP_THEMES.find((t) => t.id === id) || APP_THEMES[0];
}

/**
 * Get all theme entries.
 * @returns {object[]}
 */
function getAllAppThemes() {
  return APP_THEMES;
}

module.exports = { getAppTheme, getAllAppThemes };
