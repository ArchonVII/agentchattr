"use strict";

/**
 * theme-picker.js — Tab bar theme dropdown for quick app theme switching.
 *
 * Creates a <select> element in the tab bar that lists all available
 * app themes and calls the theme loader on change.
 */

const {
  applyAppTheme,
  getCurrentAppTheme,
  initAppTheme,
} = require("./theme-loader");
const { getAllAppThemes } = require("./theme-registry");

/**
 * Create and mount the theme picker dropdown into the tab bar.
 * Also initialises the theme system (loads persisted theme).
 */
async function mountThemePicker() {
  // Initialise theme system first (loads persisted theme)
  await initAppTheme();

  const tabBar = document.querySelector(".tab-bar");
  if (!tabBar) return;

  const picker = document.createElement("div");
  picker.className = "tab-item";
  picker.style.marginLeft = "auto";
  picker.style.display = "flex";
  picker.style.alignItems = "center";
  picker.style.webkitAppRegion = "no-drag";

  const select = document.createElement("select");
  select.id = "app-theme-picker";
  select.title = "App theme";
  select.style.cssText = [
    "padding: 2px 8px",
    "font-size: 11px",
    "font-family: var(--font-ui)",
    "background: var(--bg-elevated)",
    "color: var(--fg-primary)",
    "border: 1px solid var(--border)",
    "border-radius: var(--radius)",
    "cursor: pointer",
    "outline: none",
    "-webkit-app-region: no-drag",
  ].join(";");

  const themes = getAllAppThemes();
  for (const theme of themes) {
    const opt = document.createElement("option");
    opt.value = theme.id;
    opt.textContent = theme.era ? `${theme.name} (${theme.era})` : theme.name;
    select.appendChild(opt);
  }

  select.value = getCurrentAppTheme();

  select.addEventListener("change", () => {
    applyAppTheme(select.value);
  });

  // Listen for external theme changes (from other windows) to keep select in sync
  if (window.require) {
    try {
      const { ipcRenderer } = window.require("electron");
      ipcRenderer.on("app-theme-changed", (_event, themeId) => {
        select.value = themeId;
      });
    } catch {
      // IPC not available
    }
  }

  picker.appendChild(select);

  // Insert after the last tab-item (before window control padding)
  const tabItems = tabBar.querySelectorAll(".tab-item");
  const lastTabItem = tabItems[tabItems.length - 1];
  if (lastTabItem && lastTabItem.nextSibling) {
    tabBar.insertBefore(picker, lastTabItem.nextSibling);
  } else {
    tabBar.appendChild(picker);
  }
}

// Auto-init when script loads (after DOM is ready)
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => mountThemePicker());
} else {
  mountThemePicker();
}
