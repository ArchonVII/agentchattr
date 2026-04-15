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
