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
    header: chalk
      .bgHex(css.bg_deep || "#171726")
      .hex(css.fg_primary || "#e0e0e0").bold,
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
