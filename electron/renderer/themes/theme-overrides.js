"use strict";

const THEME_OVERRIDE_KEYS = [
  "--bg-app",
  "--bg-surface",
  "--bg-elevated",
  "--bg-deep",
  "--bg-sunken",
  "--fg-primary",
  "--fg-secondary",
  "--fg-muted",
  "--fg-dim",
  "--fg-faint",
  "--accent",
  "--accent-danger",
  "--accent-success",
  "--border",
  "--border-strong",
  "--border-grid",
];

function normalizeOverrideValue(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.startsWith("#") ? trimmed.toLowerCase() : trimmed;
}

function sanitizeThemeOverrides(overrides) {
  const next = {};
  if (!overrides || typeof overrides !== "object") return next;

  for (const token of THEME_OVERRIDE_KEYS) {
    const normalized = normalizeOverrideValue(overrides[token]);
    if (normalized) {
      next[token] = normalized;
    }
  }

  return next;
}

function clearThemeOverridesFromRoot(root) {
  if (!root?.style) return;
  for (const token of THEME_OVERRIDE_KEYS) {
    root.style.removeProperty(token);
  }
}

function applyThemeOverridesToRoot(root, overrides) {
  if (!root?.style) return;
  const sanitized = sanitizeThemeOverrides(overrides);
  for (const [token, value] of Object.entries(sanitized)) {
    root.style.setProperty(token, value);
  }
}

function buildThemeExport(themeId, overrides) {
  return {
    themeId: typeof themeId === "string" && themeId.trim() ? themeId : "default",
    exportedAt: new Date().toISOString(),
    tokens: THEME_OVERRIDE_KEYS,
    overrides: sanitizeThemeOverrides(overrides),
  };
}

module.exports = {
  THEME_OVERRIDE_KEYS,
  sanitizeThemeOverrides,
  clearThemeOverridesFromRoot,
  applyThemeOverridesToRoot,
  buildThemeExport,
};
