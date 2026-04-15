"use strict";

/**
 * theme-loader.js — Runtime theme switching for the app shell.
 *
 * Manages the data-theme attribute on <html>, dynamically loads/unloads
 * adapter <link> stylesheets, loads custom fonts via FontFace API,
 * and persists the choice via electron-store IPC.
 *
 * The terminal theme system (terminal-themes.js) is independent and
 * not affected by this module.
 */

const { getAppTheme, getAllAppThemes } = require("./theme-registry");

/** @type {string} Currently active theme id */
let _currentThemeId = "default";

/** Tracks already-loaded font families to avoid double-loading. */
const _loadedFonts = new Set();

// ---------------------------------------------------------------------------
// Font loading
// ---------------------------------------------------------------------------

/**
 * Load a theme font via the FontFace API if not already loaded.
 * @param {{ family: string, file: string, format: string }} font
 * @returns {Promise<void>}
 */
async function _loadFont(font) {
  if (!font || !font.file) return;
  if (_loadedFonts.has(font.family)) return;

  try {
    const url = `../assets/fonts/${font.file}`;
    const face = new FontFace(
      font.family,
      `url("${url}") format("${font.format}")`,
    );
    await face.load();
    document.fonts.add(face);
    _loadedFonts.add(font.family);
  } catch (err) {
    console.warn(`[theme-loader] Failed to load font "${font.family}":`, err);
  }
}

// ---------------------------------------------------------------------------
// Adapter stylesheet management
// ---------------------------------------------------------------------------

/** @type {HTMLLinkElement|null} Currently active adapter <link> element */
let _adapterLink = null;

/**
 * Remove the currently loaded adapter stylesheet.
 */
function _removeAdapter() {
  if (_adapterLink) {
    _adapterLink.remove();
    _adapterLink = null;
  }
}

/**
 * Load an adapter stylesheet by filename.
 * @param {string} adapterFile  Filename relative to themes/ directory
 * @returns {Promise<void>}  Resolves when the stylesheet has loaded
 */
function _loadAdapter(adapterFile) {
  return new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.id = "theme-adapter";
    link.href = `./themes/${adapterFile}`;
    link.onload = () => resolve();
    link.onerror = () => {
      console.warn(`[theme-loader] Failed to load adapter: ${adapterFile}`);
      reject(new Error(`Adapter load failed: ${adapterFile}`));
    };
    document.head.appendChild(link);
    _adapterLink = link;
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Apply a theme by id. Sets data-theme attribute, swaps adapter stylesheet,
 * loads fonts, and persists the choice.
 *
 * @param {string} themeId
 * @returns {Promise<void>}
 */
async function applyAppTheme(themeId) {
  const theme = getAppTheme(themeId);

  // 1. Set data attribute (triggers CSS variable overrides)
  document.documentElement.dataset.theme = theme.id;

  // 2. Swap adapter stylesheet
  _removeAdapter();
  if (theme.adapter) {
    try {
      await _loadAdapter(theme.adapter);
    } catch {
      // Adapter failed to load — fall back to default (base.css only)
      document.documentElement.dataset.theme = "default";
    }
  }

  // 3. Load font if needed
  if (theme.font) {
    await _loadFont(theme.font);
  }

  _currentThemeId = theme.id;

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("app-theme-updated", {
        detail: { themeId: theme.id },
      }),
    );
  }

  // 4. Persist choice via IPC (non-blocking)
  if (window.electronAPI?.setPreference) {
    window.electronAPI.setPreference("appTheme", theme.id);
  } else if (window.require) {
    try {
      const { ipcRenderer } = window.require("electron");
      ipcRenderer.invoke("set-preference", "appTheme", theme.id);
      // Broadcast to other windows
      ipcRenderer.send("app-theme-changed", theme.id);
    } catch {
      // IPC not available — silently continue
    }
  }
}

/**
 * Returns the currently active theme id.
 * @returns {string}
 */
function getCurrentAppTheme() {
  return _currentThemeId;
}

/**
 * Initialise the theme system on app launch.
 * Reads the persisted theme from electron-store and applies it.
 *
 * @returns {Promise<void>}
 */
async function initAppTheme() {
  let storedId = "default";

  if (window.electronAPI?.getPreference) {
    storedId =
      (await window.electronAPI.getPreference("appTheme")) || "default";
  } else if (window.require) {
    try {
      const { ipcRenderer } = window.require("electron");
      storedId =
        (await ipcRenderer.invoke("get-preference", "appTheme")) || "default";

      // Listen for theme changes from other windows
      ipcRenderer.on("app-theme-changed", (_event, themeId) => {
        if (themeId !== _currentThemeId) {
          applyAppTheme(themeId);
        }
      });
    } catch {
      // IPC not available
    }
  }

  await applyAppTheme(storedId);
}

module.exports = {
  applyAppTheme,
  getCurrentAppTheme,
  getAllAppThemes,
  initAppTheme,
};
