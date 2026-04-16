"use strict";

/**
 * chat-theme-bridge.js — Maps Electron app-shell theme variables onto the
 * chat page's (static/style.css) independent CSS variable system.
 *
 * The chat page defines ~60 custom properties with its own naming scheme.
 * This bridge reads the computed values from base.css / adapter-*.css and
 * produces a complete set of overrides so the chat webview matches the
 * active app theme.
 *
 * Variables fall into three categories:
 *   1. Direct map   — chat var → app var (read from computed style)
 *   2. Derived      — computed from mapped values (alpha tints, soft variants)
 *   3. Static       — constants that don't change per-theme (radii, spacing)
 */

// ---------------------------------------------------------------------------
// 1. Direct mappings: chatVar → appVar (read from getComputedStyle)
// ---------------------------------------------------------------------------

const CHAT_THEME_TOKEN_MAP = {
  // Surfaces
  "--bg": "--bg-app",
  "--bg-header": "--bg-surface",
  "--bg-input": "--bg-elevated",
  "--bg-msg": "--bg-deep",
  "--bg-msg-hover": "--bg-surface",
  "--bg-elevated": "--bg-elevated",
  "--bg-subtle": "--accent-subtle",
  "--bg-overlay": "--bg-app", // overridden with alpha in derived step

  // Borders
  "--border": "--border",
  "--border-strong": "--border-strong",
  "--border-subtle": "--border",

  // Text
  "--text": "--fg-primary",
  "--text-dim": "--fg-secondary",
  "--text-system": "--fg-muted",
  "--text-muted": "--fg-secondary",

  // Accents
  "--accent": "--accent",
  "--accent-soft": "--accent-subtle",
  "--accent-hover": "--accent-hover-bg",

  // Semantic colours
  "--success": "--accent-success",
  "--online": "--accent-success",
  "--danger": "--accent-danger",
  "--error-color": "--accent-danger",
};

// ---------------------------------------------------------------------------
// 2. Derived values: computed from the resolved theme palette
// ---------------------------------------------------------------------------

/**
 * Parse a CSS colour value into { r, g, b } (0-255).
 * Handles #hex, rgb(), and rgba() formats.
 */
function _parseColour(raw) {
  if (!raw) return null;
  const s = raw.trim();

  // #rrggbb or #rgb
  const hexMatch = s.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (hexMatch) {
    return {
      r: parseInt(hexMatch[1], 16),
      g: parseInt(hexMatch[2], 16),
      b: parseInt(hexMatch[3], 16),
    };
  }
  const shortHex = s.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (shortHex) {
    return {
      r: parseInt(shortHex[1] + shortHex[1], 16),
      g: parseInt(shortHex[2] + shortHex[2], 16),
      b: parseInt(shortHex[3] + shortHex[3], 16),
    };
  }

  // rgb(r, g, b) or rgba(r, g, b, a)
  const rgbMatch = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1], 10),
      g: parseInt(rgbMatch[2], 10),
      b: parseInt(rgbMatch[3], 10),
    };
  }

  return null;
}

function _rgba(r, g, b, a) {
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * Generate derived chat variables from the resolved direct-mapped values.
 *
 * @param {Record<string, string>} vars  Already-resolved direct mappings
 * @param {(name: string) => string} readCssVar  Read from computed style
 * @returns {Record<string, string>}  Additional overrides to merge
 */
function _deriveChatVars(vars, readCssVar) {
  const derived = {};

  const colorScheme = readCssVar("--color-scheme").trim() || "dark";
  const isLight = colorScheme === "light";

  // ── Neutral alpha tints ──────────────────────────────────────────────
  // Dark themes use white-alpha; light themes use black-alpha.
  // Source: style.css defines --white-02 through --white-15 as white alpha.
  const tintBase = isLight ? "0, 0, 0" : "255, 255, 255";
  derived["--white-02"] = `rgba(${tintBase}, 0.02)`;
  derived["--white-03"] = `rgba(${tintBase}, 0.03)`;
  derived["--white-04"] = `rgba(${tintBase}, 0.04)`;
  derived["--white-06"] = `rgba(${tintBase}, 0.06)`;
  derived["--white-08"] = `rgba(${tintBase}, 0.08)`;
  derived["--white-10"] = `rgba(${tintBase}, 0.10)`;
  derived["--white-12"] = `rgba(${tintBase}, 0.12)`;
  derived["--white-15"] = `rgba(${tintBase}, 0.15)`;

  // ── Overlay ──────────────────────────────────────────────────────────
  const bgParsed = _parseColour(vars["--bg"]);
  if (bgParsed) {
    derived["--bg-overlay"] = _rgba(bgParsed.r, bgParsed.g, bgParsed.b, 0.72);
  }

  // ── Secondary background (--bg-2) ────────────────────────────────────
  // Used for code blocks and secondary panels.
  derived["--bg-2"] = vars["--bg-elevated"] || vars["--bg-header"] || "";

  // ── Accent-derived soft backgrounds ──────────────────────────────────
  const accentParsed = _parseColour(vars["--accent"]);
  if (accentParsed) {
    derived["--accent-soft"] =
      derived["--accent-soft"] ||
      _rgba(accentParsed.r, accentParsed.g, accentParsed.b, 0.14);
    derived["--accent-hover"] =
      vars["--accent-hover"] ||
      _rgba(accentParsed.r, accentParsed.g, accentParsed.b, 0.22);
  }

  // ── Semantic soft variants ───────────────────────────────────────────
  const successParsed = _parseColour(vars["--success"]);
  if (successParsed) {
    derived["--success-soft"] = _rgba(
      successParsed.r,
      successParsed.g,
      successParsed.b,
      0.16,
    );
  }

  const dangerParsed = _parseColour(vars["--danger"]);
  if (dangerParsed) {
    derived["--danger-soft"] = _rgba(
      dangerParsed.r,
      dangerParsed.g,
      dangerParsed.b,
      0.14,
    );
    derived["--error-soft"] = _rgba(
      dangerParsed.r,
      dangerParsed.g,
      dangerParsed.b,
      0.16,
    );
  }

  // ── Info / Warning / Pending ─────────────────────────────────────────
  // base.css doesn't define these; use sensible defaults per colour scheme.
  // Source: original style.css dark-theme defaults, adapted for light themes.
  if (isLight) {
    derived["--info"] = "#0077b6";
    derived["--warning"] = "#b8860b";
    derived["--pending"] = "#c2185b";
    derived["--user-color"] = "#0077b6";
    derived["--green"] = "#2e7d32";
  } else {
    derived["--info"] = "#16f4ff";
    derived["--warning"] = "#ffe66d";
    derived["--pending"] = "#ff3cac";
    derived["--user-color"] = "#16f4ff";
    derived["--green"] = "#4ade80";
  }

  // ── Text on accent ───────────────────────────────────────────────────
  // Needs to be legible on --accent backgrounds.
  derived["--text-on-accent"] = isLight ? "#fff" : "#fff";

  // ── Sidebar legacy tokens ────────────────────────────────────────────
  // These reference border colours that change per theme.
  const borderVal = vars["--border"] || "";
  if (borderVal) {
    derived["--sb-card-border-color"] = borderVal;
  }

  return derived;
}

// ---------------------------------------------------------------------------
// 3. Public API
// ---------------------------------------------------------------------------

function collectChatThemeVars(readCssVar) {
  const nextVars = {};

  // Direct mappings
  for (const [chatVar, appVar] of Object.entries(CHAT_THEME_TOKEN_MAP)) {
    const value = readCssVar(appVar);
    if (typeof value === "string" && value.trim()) {
      nextVars[chatVar] = value.trim();
    }
  }

  // Derived values
  const derived = _deriveChatVars(nextVars, readCssVar);
  for (const [k, v] of Object.entries(derived)) {
    if (v) nextVars[k] = v;
  }

  return nextVars;
}

function buildApplyChatThemeScript(vars) {
  const payload = JSON.stringify(vars || {});
  return `
    (() => {
      const vars = ${payload};
      const root = document.documentElement;
      Object.entries(vars).forEach(([name, value]) => {
        if (typeof value === "string" && value) {
          root.style.setProperty(name, value);
        }
      });
      root.setAttribute("data-electron-theme-bridge", "true");
      return true;
    })();
  `;
}

const exported = {
  CHAT_THEME_TOKEN_MAP,
  collectChatThemeVars,
  buildApplyChatThemeScript,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = exported;
}

if (typeof window !== "undefined") {
  window.ChatThemeBridge = exported;
}
