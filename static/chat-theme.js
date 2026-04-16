"use strict";

const CHAT_THEME_STORAGE_KEY = "agentchattr-app-theme";
const VALID_CHAT_THEMES = new Set([
  "default",
  "nes",
  "win98",
  "winxp",
  "system6",
  "classic",
  "c64",
  "c64css3",
  "psone",
  "cyberpunk",
  "tui",
]);

const CHAT_THEME_TOKEN_MAP = {
  "--bg": "--bg-app",
  "--bg-header": "--bg-surface",
  "--bg-input": "--bg-elevated",
  "--bg-msg": "--bg-deep",
  "--bg-msg-hover": "--bg-surface",
  "--bg-elevated": "--bg-elevated",
  "--bg-subtle": "--accent-subtle",
  "--bg-overlay": "--bg-app",
  "--border": "--border",
  "--border-strong": "--border-strong",
  "--border-subtle": "--border",
  "--surface-hover": "--surface-hover",
  "--surface-hover-strong": "--surface-hover-strong",
  "--control-hover-fg": "--control-hover-fg",
  "--status-offline": "--status-offline",
  "--state-danger-fg": "--state-danger-fg",
  "--state-danger-fg-strong": "--state-danger-fg-strong",
  "--state-danger-bg": "--state-danger-bg",
  "--state-danger-bg-strong": "--state-danger-bg-strong",
  "--state-danger-border": "--state-danger-border",
  "--state-danger-border-strong": "--state-danger-border-strong",
  "--state-danger-bg-hover": "--state-danger-bg-hover",
  "--state-success-fg": "--state-success-fg",
  "--state-success-fg-strong": "--state-success-fg-strong",
  "--state-success-bg": "--state-success-bg",
  "--state-success-bg-strong": "--state-success-bg-strong",
  "--state-success-bg-hover": "--state-success-bg-hover",
  "--state-info-bg": "--state-info-bg",
  "--state-info-border": "--state-info-border",
  "--state-info-border-strong": "--state-info-border-strong",
  "--state-info-fg": "--state-info-fg",
  "--accent-info": "--accent-info",
  "--focus-ring": "--focus-ring",
  "--panel-shadow-strong": "--panel-shadow-strong",
  "--pixel-shadow-dark": "--pixel-shadow-dark",
  "--pixel-shadow-light": "--pixel-shadow-light",
  "--bevel-bg": "--bevel-bg",
  "--bevel-bg-hover": "--bevel-bg-hover",
  "--bevel-fg": "--bevel-fg",
  "--bevel-shadow-dark": "--bevel-shadow-dark",
  "--bevel-shadow-light": "--bevel-shadow-light",
  "--bevel-shadow-darker": "--bevel-shadow-darker",
  "--bevel-shadow-lighter": "--bevel-shadow-lighter",
  "--font-ui": "--font-ui",
  "--font-display": "--font-display",
  "--font-decorative": "--font-decorative",
  "--font-mono": "--font-mono",
  "--font-size-base": "--font-size-base",
  "--text-on-accent": "--text-on-accent",
  "--text": "--fg-primary",
  "--text-dim": "--fg-secondary",
  "--text-system": "--fg-muted",
  "--text-muted": "--fg-secondary",
  "--accent": "--accent",
  "--accent-soft": "--accent-subtle",
  "--accent-hover": "--accent-hover-bg",
  "--success": "--accent-success",
  "--online": "--accent-success",
  "--danger": "--accent-danger",
  "--error-color": "--accent-danger",
};

function parseColour(raw) {
  if (!raw) return null;
  const value = raw.trim();

  const hex = value.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (hex) {
    return {
      r: parseInt(hex[1], 16),
      g: parseInt(hex[2], 16),
      b: parseInt(hex[3], 16),
    };
  }

  const shortHex = value.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (shortHex) {
    return {
      r: parseInt(shortHex[1] + shortHex[1], 16),
      g: parseInt(shortHex[2] + shortHex[2], 16),
      b: parseInt(shortHex[3] + shortHex[3], 16),
    };
  }

  const rgb = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgb) {
    return {
      r: parseInt(rgb[1], 10),
      g: parseInt(rgb[2], 10),
      b: parseInt(rgb[3], 10),
    };
  }

  return null;
}

function rgba(r, g, b, a) {
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function deriveChatVars(vars, readCssVar) {
  const derived = {};
  const colorScheme = (readCssVar("--color-scheme") || "").trim() || "dark";
  const isLight = colorScheme === "light";
  const tintBase = isLight ? "0, 0, 0" : "255, 255, 255";

  derived["--white-02"] = `rgba(${tintBase}, 0.02)`;
  derived["--white-03"] = `rgba(${tintBase}, 0.03)`;
  derived["--white-04"] = `rgba(${tintBase}, 0.04)`;
  derived["--white-06"] = `rgba(${tintBase}, 0.06)`;
  derived["--white-08"] = `rgba(${tintBase}, 0.08)`;
  derived["--white-10"] = `rgba(${tintBase}, 0.10)`;
  derived["--white-12"] = `rgba(${tintBase}, 0.12)`;
  derived["--white-15"] = `rgba(${tintBase}, 0.15)`;

  const bgParsed = parseColour(vars["--bg"]);
  if (bgParsed) {
    derived["--bg-overlay"] = rgba(bgParsed.r, bgParsed.g, bgParsed.b, 0.72);
  }

  derived["--bg-2"] = vars["--bg-elevated"] || vars["--bg-header"] || "";

  const accentParsed = parseColour(vars["--accent"]);
  if (accentParsed) {
    derived["--accent-soft"] =
      derived["--accent-soft"] ||
      rgba(accentParsed.r, accentParsed.g, accentParsed.b, 0.14);
    derived["--accent-hover"] =
      vars["--accent-hover"] ||
      rgba(accentParsed.r, accentParsed.g, accentParsed.b, 0.22);
  }

  const successParsed = parseColour(vars["--success"]);
  if (successParsed) {
    derived["--success-soft"] = rgba(
      successParsed.r,
      successParsed.g,
      successParsed.b,
      0.16,
    );
  }

  const dangerParsed = parseColour(vars["--danger"]);
  if (dangerParsed) {
    derived["--danger-soft"] = rgba(
      dangerParsed.r,
      dangerParsed.g,
      dangerParsed.b,
      0.14,
    );
    derived["--error-soft"] = rgba(
      dangerParsed.r,
      dangerParsed.g,
      dangerParsed.b,
      0.16,
    );
  }

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

  derived["--text-on-accent"] = "#fff";

  const border = vars["--border"] || "";
  if (border) {
    derived["--sb-card-border-color"] = border;
  }

  return derived;
}

function collectChatThemeVars(readCssVar) {
  const vars = {};

  for (const [chatVar, sharedVar] of Object.entries(CHAT_THEME_TOKEN_MAP)) {
    const value = readCssVar(sharedVar);
    if (typeof value === "string" && value.trim()) {
      vars[chatVar] = value.trim();
    }
  }

  const derived = deriveChatVars(vars, readCssVar);
  for (const [key, value] of Object.entries(derived)) {
    if (value) vars[key] = value;
  }

  return vars;
}

function normaliseThemeId(themeId) {
  return VALID_CHAT_THEMES.has(themeId) ? themeId : "default";
}

function applyThemeVars(vars, root) {
  for (const [name, value] of Object.entries(vars)) {
    if (typeof value === "string" && value) {
      root.style.setProperty(name, value);
    }
  }
}

function applySharedTheme(themeId) {
  if (typeof document === "undefined") {
    return "default";
  }

  const root = document.documentElement;
  const nextThemeId = normaliseThemeId(themeId);
  root.dataset.theme = nextThemeId;

  const computed = getComputedStyle(root);
  const vars = collectChatThemeVars((name) => computed.getPropertyValue(name));
  applyThemeVars(vars, root);
  root.dataset.sharedTheme = nextThemeId;

  try {
    window.localStorage?.setItem(CHAT_THEME_STORAGE_KEY, nextThemeId);
  } catch {
    // Storage failures are non-fatal.
  }

  return nextThemeId;
}

function initSharedTheme() {
  if (typeof document === "undefined") {
    return "default";
  }

  let storedThemeId = "default";
  try {
    storedThemeId = window.localStorage?.getItem(CHAT_THEME_STORAGE_KEY) || "default";
  } catch {
    storedThemeId = "default";
  }

  return applySharedTheme(storedThemeId);
}

const exported = {
  CHAT_THEME_STORAGE_KEY,
  CHAT_THEME_TOKEN_MAP,
  collectChatThemeVars,
  applySharedTheme,
  initSharedTheme,
  normaliseThemeId,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = exported;
}

if (typeof window !== "undefined") {
  window.ChatTheme = exported;
  window.applySharedTheme = applySharedTheme;
  initSharedTheme();
}
