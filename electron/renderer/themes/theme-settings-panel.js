"use strict";

const { getAppTheme } = require("./theme-registry");
const {
  THEME_OVERRIDE_KEYS,
  buildThemeExport,
} = require("./theme-overrides");
const {
  getCurrentAppTheme,
  getThemeOverrides,
  previewThemeOverrides,
  discardThemeOverridePreview,
  saveThemeOverrides,
  resetThemeOverrides,
} = require("./theme-loader");

const TOKEN_LABELS = {
  "--bg-app": "App Background",
  "--bg-surface": "Surface",
  "--bg-elevated": "Elevated Surface",
  "--bg-deep": "Deep Surface",
  "--bg-sunken": "Sunken Surface",
  "--fg-primary": "Primary Text",
  "--fg-secondary": "Secondary Text",
  "--fg-muted": "Muted Text",
  "--fg-dim": "Dim Text",
  "--fg-faint": "Faint Text",
  "--accent": "Accent",
  "--accent-hover-bg": "Accent Hover",
  "--accent-subtle": "Accent Subtle",
  "--accent-danger": "Danger",
  "--accent-success": "Success",
  "--border": "Border",
  "--border-strong": "Strong Border",
  "--border-grid": "Grid Border",
};

let panel = null;
let subtitle = null;
let form = null;
let currentDraft = {};

function colorStringToHex(value) {
  if (!value) return "#000000";
  const trimmed = value.trim();
  if (trimmed.startsWith("#")) {
    if (trimmed.length === 4) {
      return (
        "#" +
        trimmed[1] +
        trimmed[1] +
        trimmed[2] +
        trimmed[2] +
        trimmed[3] +
        trimmed[3]
      ).toLowerCase();
    }
    return trimmed.toLowerCase();
  }

  const match = trimmed.match(/\d+(\.\d+)?/g);
  if (!match || match.length < 3) return "#000000";
  const [r, g, b] = match.slice(0, 3).map((part) => {
    const n = Number(part);
    return Math.max(0, Math.min(255, Math.round(n)));
  });
  return (
    "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")
  ).toLowerCase();
}

function getResolvedThemeValue(token) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(token);
  return colorStringToHex(value);
}

function getThemeTitle(themeId) {
  const theme = getAppTheme(themeId);
  return theme.era ? `${theme.name} (${theme.era})` : theme.name;
}

function readDraftFromForm() {
  const next = {};
  for (const token of THEME_OVERRIDE_KEYS) {
    const input = form?.querySelector(`[data-token="${token}"]`);
    if (input?.value) {
      next[token] = input.value.toLowerCase();
    }
  }
  return next;
}

function refreshSubtitle() {
  if (!subtitle) return;
  subtitle.textContent = `Editing ${getThemeTitle(getCurrentAppTheme())}`;
}

function updatePreview() {
  currentDraft = readDraftFromForm();
  previewThemeOverrides(currentDraft);
}

function populateForm() {
  if (!form) return;
  refreshSubtitle();

  const saved = getThemeOverrides(getCurrentAppTheme());
  currentDraft = {};
  form.innerHTML = "";

  for (const token of THEME_OVERRIDE_KEYS) {
    const value = (saved[token] || getResolvedThemeValue(token)).toLowerCase();
    currentDraft[token] = value;

    const row = document.createElement("label");
    row.style.cssText = [
      "display:grid",
      "grid-template-columns: 1fr auto auto auto",
      "gap:8px",
      "align-items:center",
      "font-size: var(--font-size-caption)",
      "margin-bottom:8px",
    ].join(";");

    const label = document.createElement("span");
    label.textContent = TOKEN_LABELS[token] || token;

    const swatch = document.createElement("span");
    swatch.style.cssText = [
      "width: 14px",
      "height: 14px",
      "border: 1px solid var(--border)",
      "background: " + value,
      "display: inline-block",
    ].join(";");

    const color = document.createElement("input");
    color.type = "color";
    color.value = value;
    color.dataset.token = token;
    color.style.cssText =
      "width: 32px; height: 22px; padding: 0; border: 1px solid var(--border); background: var(--bg-elevated);";

    const text = document.createElement("input");
    text.type = "text";
    text.value = value;
    text.style.cssText = [
      "width: 98px",
      "padding: 4px 6px",
      "border: 1px solid var(--border)",
      "background: var(--bg-elevated)",
      "color: var(--fg-primary)",
      "font: inherit",
      "font-size: var(--font-size-caption)",
    ].join(";");

    color.addEventListener("input", () => {
      text.value = color.value.toLowerCase();
      swatch.style.background = color.value;
      updatePreview();
    });

    text.addEventListener("change", () => {
      const next = colorStringToHex(text.value);
      text.value = next;
      color.value = next;
      swatch.style.background = next;
      updatePreview();
    });

    row.append(label, swatch, color, text);
    form.appendChild(row);
  }

  previewThemeOverrides(currentDraft);
}

function downloadExport(payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = payload.themeId.replace(/[^a-z0-9_-]+/gi, "-");
  link.href = href;
  link.download = `agentchattr-theme-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

function ensurePanel() {
  if (panel) return panel;

  panel = document.createElement("div");
  panel.id = "app-theme-settings-panel";
  panel.hidden = true;
  panel.style.cssText = [
    "position: fixed",
    "top: 48px",
    "right: 12px",
    "width: 360px",
    "max-height: calc(100vh - 72px)",
    "overflow: auto",
    "z-index: 1000",
    "padding: 14px",
    "border: 1px solid var(--border)",
    "border-radius: var(--radius-lg)",
    "background: var(--bg-surface)",
    "color: var(--fg-primary)",
    "box-shadow: var(--shadow-menu)",
    "font-family: var(--font-ui)",
  ].join(";");

  const title = document.createElement("div");
  title.textContent = "Theme Settings";
  title.style.cssText =
    "font: 700 var(--font-size-panel-title)/1.2 var(--font-display); margin-bottom: 4px;";

  subtitle = document.createElement("div");
  subtitle.style.cssText =
    "font-size: var(--font-size-caption); color: var(--fg-secondary); margin-bottom: 12px;";

  form = document.createElement("div");

  const actions = document.createElement("div");
  actions.style.cssText =
    "display:flex; gap:8px; flex-wrap:wrap; margin-top: 12px;";

  const makeButton = (label, onClick) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.style.cssText = [
      "padding: 6px 10px",
      "border: 1px solid var(--border)",
      "border-radius: var(--radius)",
      "background: var(--bg-elevated)",
      "color: var(--fg-primary)",
      "font: 600 var(--font-size-chrome)/1 var(--font-display)",
      "cursor: pointer",
    ].join(";");
    button.addEventListener("click", onClick);
    return button;
  };

  actions.append(
    makeButton("Save", async () => {
      currentDraft = readDraftFromForm();
      await saveThemeOverrides(getCurrentAppTheme(), currentDraft);
      populateForm();
    }),
    makeButton("Reset", async () => {
      await resetThemeOverrides(getCurrentAppTheme());
      populateForm();
    }),
    makeButton("Export", () => {
      const payload = buildThemeExport(getCurrentAppTheme(), readDraftFromForm());
      downloadExport(payload);
      window.electronAPI?.writeClipboardText?.(JSON.stringify(payload, null, 2));
    }),
    makeButton("Close", () => {
      discardThemeOverridePreview();
      panel.hidden = true;
    }),
  );

  panel.append(title, subtitle, form, actions);
  document.body.appendChild(panel);

  window.addEventListener("app-theme-updated", () => {
    if (!panel.hidden) {
      populateForm();
    }
  });

  return panel;
}

function mountThemeSettingsButton(parent) {
  const button = document.createElement("button");
  button.type = "button";
  button.id = "app-theme-settings-button";
  button.textContent = "Theme";
  button.title = "Theme settings";
  button.style.cssText = [
    "margin-left: 8px",
    "padding: 4px 8px",
    "border: 1px solid var(--border)",
    "border-radius: var(--radius)",
    "background: var(--bg-elevated)",
    "color: var(--fg-primary)",
    "font: 600 var(--font-size-chrome)/1 var(--font-display)",
    "cursor: pointer",
    "-webkit-app-region: no-drag",
  ].join(";");

  button.addEventListener("click", () => {
    const nextPanel = ensurePanel();
    nextPanel.hidden = !nextPanel.hidden;
    if (!nextPanel.hidden) {
      populateForm();
    } else {
      discardThemeOverridePreview();
    }
  });

  parent.appendChild(button);
}

module.exports = { mountThemeSettingsButton };
