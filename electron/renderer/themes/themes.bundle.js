"use strict";
(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };

  // renderer/themes/theme-registry.js
  var require_theme_registry = __commonJS({
    "renderer/themes/theme-registry.js"(exports, module) {
      "use strict";
      var APP_THEMES = [
        {
          id: "default",
          name: "Default",
          era: null,
          adapter: null,
          font: null,
          terminalTheme: "default",
          preview: { bg: "#12121e", fg: "#e0e0e0", accent: "#da7756" }
        },
        {
          id: "nes",
          name: "NES",
          era: "8-bit",
          adapter: "adapter-nes.css",
          font: {
            family: "Press Start 2P",
            file: "PressStart2P-Regular.ttf",
            format: "truetype"
          },
          terminalTheme: "nes",
          preview: { bg: "#212529", fg: "#fff", accent: "#e76e55" }
        },
        {
          id: "win98",
          name: "Windows 98",
          era: "1998",
          adapter: "adapter-98.css",
          font: null,
          terminalTheme: "msdos",
          preview: { bg: "#008080", fg: "#000", accent: "#000080" }
        },
        {
          id: "winxp",
          name: "Windows XP",
          era: "2001",
          adapter: "adapter-xp.css",
          font: null,
          terminalTheme: "msdos",
          preview: { bg: "#3a6ea5", fg: "#0f172a", accent: "#245edb" }
        },
        {
          id: "system6",
          name: "System 6",
          era: "1988",
          adapter: "adapter-system.css",
          font: null,
          terminalTheme: "system6",
          preview: { bg: "#fff", fg: "#000", accent: "#000" }
        },
        {
          id: "classic",
          name: "Classic Mac",
          era: "1998",
          adapter: "adapter-classic.css",
          font: {
            family: "ChicagoFLF",
            file: "ChicagoFLF.ttf",
            format: "truetype"
          },
          terminalTheme: "system6",
          preview: { bg: "#bfbfbf", fg: "#111", accent: "#111" }
        },
        {
          id: "c64",
          name: "Commodore 64",
          era: "1982",
          adapter: "adapter-c64.css",
          font: {
            family: "C64_Pro_Mono",
            file: "C64_Pro_Mono-STYLE.woff",
            format: "woff"
          },
          terminalTheme: "c64",
          preview: { bg: "#352879", fg: "#6C5EB5", accent: "#6C5EB5" }
        },
        {
          id: "c64css3",
          name: "C64 CSS3",
          era: "1982",
          adapter: "adapter-c64css3.css",
          font: {
            family: "C64 User Mono",
            file: "C64_User_Mono_v1.0-STYLE.woff",
            format: "woff"
          },
          terminalTheme: "c64",
          preview: { bg: "#20398d", fg: "#6076c5", accent: "#6076c5" }
        },
        {
          id: "psone",
          name: "PlayStation",
          era: "1994",
          adapter: "adapter-psone.css",
          font: {
            family: "Final Fantasy Script Collection - Final Fantasy VII",
            file: "Final_Fantasy_VII.woff",
            format: "woff"
          },
          terminalTheme: "cyberpunk",
          // Cyberpunk fits the PS1 sci-fi aesthetic best
          preview: { bg: "#12151a", fg: "#fff", accent: "#5db2ff" }
        },
        {
          id: "tui",
          name: "TuiCss",
          era: "DOS",
          adapter: "adapter-tui.css",
          font: {
            family: "Perfect DOS VGA 437 Win",
            file: "Perfect DOS VGA 437 Win.ttf",
            format: "truetype"
          },
          terminalTheme: "msdos",
          preview: { bg: "#0000aa", fg: "#fff", accent: "#ffff55" }
        }
      ];
      function getAllAppThemes2() {
        return APP_THEMES;
      }
      function getAppTheme(id) {
        return APP_THEMES.find((t) => t.id === id) ?? APP_THEMES[0];
      }
      module.exports = { getAllAppThemes: getAllAppThemes2, getAppTheme };
    }
  });

  // renderer/themes/theme-overrides.js
  var require_theme_overrides = __commonJS({
    "renderer/themes/theme-overrides.js"(exports, module) {
      "use strict";
      var THEME_OVERRIDE_KEYS = [
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
        "--border-grid"
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
          exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
          tokens: THEME_OVERRIDE_KEYS,
          overrides: sanitizeThemeOverrides(overrides)
        };
      }
      module.exports = {
        THEME_OVERRIDE_KEYS,
        sanitizeThemeOverrides,
        clearThemeOverridesFromRoot,
        applyThemeOverridesToRoot,
        buildThemeExport
      };
    }
  });

  // renderer/themes/theme-loader.js
  var require_theme_loader = __commonJS({
    "renderer/themes/theme-loader.js"(exports, module) {
      "use strict";
      var { getAppTheme, getAllAppThemes: getAllAppThemes2 } = require_theme_registry();
      var {
        sanitizeThemeOverrides,
        clearThemeOverridesFromRoot,
        applyThemeOverridesToRoot
      } = require_theme_overrides();
      var _currentThemeId = "default";
      var _loadedFonts = /* @__PURE__ */ new Set();
      var _themeOverridesByTheme = null;
      var _previewOverrides = null;
      async function _loadFont(font) {
        if (!font || !font.file) return;
        if (_loadedFonts.has(font.family)) return;
        try {
          const url = `../assets/fonts/${font.file}`;
          const face = new FontFace(
            font.family,
            `url("${url}") format("${font.format}")`
          );
          await face.load();
          document.fonts.add(face);
          _loadedFonts.add(font.family);
        } catch (err) {
          console.warn(`[theme-loader] Failed to load font "${font.family}":`, err);
        }
      }
      var _adapterLink = null;
      function _removeAdapter() {
        if (_adapterLink) {
          _adapterLink.remove();
          _adapterLink = null;
        }
      }
      async function _loadStoredThemeOverrides() {
        if (_themeOverridesByTheme) {
          return _themeOverridesByTheme;
        }
        let stored = {};
        if (window.electronAPI?.getPreference) {
          stored = await window.electronAPI.getPreference("appThemeOverrides") || {};
        } else if (window.require) {
          try {
            const { ipcRenderer } = window.require("electron");
            stored = await ipcRenderer.invoke("get-preference", "appThemeOverrides") || {};
          } catch {
            stored = {};
          }
        }
        _themeOverridesByTheme = stored && typeof stored === "object" ? { ...stored } : {};
        return _themeOverridesByTheme;
      }
      async function _persistStoredThemeOverrides() {
        if (!_themeOverridesByTheme) return;
        if (window.electronAPI?.setPreference) {
          await window.electronAPI.setPreference(
            "appThemeOverrides",
            _themeOverridesByTheme
          );
        } else if (window.require) {
          try {
            const { ipcRenderer } = window.require("electron");
            await ipcRenderer.invoke(
              "set-preference",
              "appThemeOverrides",
              _themeOverridesByTheme
            );
          } catch {
          }
        }
      }
      function _getStoredThemeOverrides(themeId) {
        if (!_themeOverridesByTheme) return {};
        return sanitizeThemeOverrides(_themeOverridesByTheme[themeId]);
      }
      function _applyResolvedThemeOverrides() {
        const root = document.documentElement;
        clearThemeOverridesFromRoot(root);
        applyThemeOverridesToRoot(root, _getStoredThemeOverrides(_currentThemeId));
        applyThemeOverridesToRoot(root, _previewOverrides);
      }
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
      async function applyAppTheme2(themeId) {
        const theme = getAppTheme(themeId);
        document.documentElement.dataset.theme = theme.id;
        _removeAdapter();
        if (theme.adapter) {
          try {
            await _loadAdapter(theme.adapter);
          } catch {
            document.documentElement.dataset.theme = "default";
          }
        }
        if (theme.font) {
          await _loadFont(theme.font);
        }
        _currentThemeId = theme.id;
        _previewOverrides = null;
        await _loadStoredThemeOverrides();
        _applyResolvedThemeOverrides();
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("app-theme-updated", {
              detail: { themeId: theme.id }
            })
          );
        }
        if (window.electronAPI?.setPreference) {
          window.electronAPI.setPreference("appTheme", theme.id);
        } else if (window.require) {
          try {
            const { ipcRenderer } = window.require("electron");
            ipcRenderer.invoke("set-preference", "appTheme", theme.id);
            ipcRenderer.send("app-theme-changed", theme.id);
          } catch {
          }
        }
      }
      function getCurrentAppTheme2() {
        return _currentThemeId;
      }
      async function initAppTheme2() {
        let storedId = "default";
        if (window.electronAPI?.getPreference) {
          storedId = await window.electronAPI.getPreference("appTheme") || "default";
        } else if (window.require) {
          try {
            const { ipcRenderer } = window.require("electron");
            storedId = await ipcRenderer.invoke("get-preference", "appTheme") || "default";
            ipcRenderer.on("app-theme-changed", (_event, themeId) => {
              if (themeId !== _currentThemeId) {
                applyAppTheme2(themeId);
              }
            });
          } catch {
          }
        }
        await applyAppTheme2(storedId);
      }
      function getThemeOverrides(themeId = _currentThemeId) {
        return { ..._getStoredThemeOverrides(themeId) };
      }
      function previewThemeOverrides(overrides) {
        _previewOverrides = sanitizeThemeOverrides(overrides);
        _applyResolvedThemeOverrides();
      }
      function discardThemeOverridePreview() {
        _previewOverrides = null;
        _applyResolvedThemeOverrides();
      }
      async function saveThemeOverrides(themeId = _currentThemeId, overrides = {}) {
        await _loadStoredThemeOverrides();
        const sanitized = sanitizeThemeOverrides(overrides);
        if (Object.keys(sanitized).length > 0) {
          _themeOverridesByTheme[themeId] = sanitized;
        } else {
          delete _themeOverridesByTheme[themeId];
        }
        if (themeId === _currentThemeId) {
          _previewOverrides = null;
          _applyResolvedThemeOverrides();
        }
        await _persistStoredThemeOverrides();
      }
      async function resetThemeOverrides(themeId = _currentThemeId) {
        await _loadStoredThemeOverrides();
        delete _themeOverridesByTheme[themeId];
        if (themeId === _currentThemeId) {
          _previewOverrides = null;
          _applyResolvedThemeOverrides();
        }
        await _persistStoredThemeOverrides();
      }
      module.exports = {
        applyAppTheme: applyAppTheme2,
        getCurrentAppTheme: getCurrentAppTheme2,
        getAllAppThemes: getAllAppThemes2,
        initAppTheme: initAppTheme2,
        getThemeOverrides,
        previewThemeOverrides,
        discardThemeOverridePreview,
        saveThemeOverrides,
        resetThemeOverrides
      };
    }
  });

  // renderer/themes/theme-settings-panel.js
  var require_theme_settings_panel = __commonJS({
    "renderer/themes/theme-settings-panel.js"(exports, module) {
      "use strict";
      var { getAppTheme } = require_theme_registry();
      var {
        THEME_OVERRIDE_KEYS,
        buildThemeExport
      } = require_theme_overrides();
      var {
        getCurrentAppTheme: getCurrentAppTheme2,
        getThemeOverrides,
        previewThemeOverrides,
        discardThemeOverridePreview,
        saveThemeOverrides,
        resetThemeOverrides
      } = require_theme_loader();
      var TOKEN_LABELS = {
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
        "--border-grid": "Grid Border"
      };
      var panel = null;
      var subtitle = null;
      var form = null;
      var currentDraft = {};
      function colorStringToHex(value) {
        if (!value) return "#000000";
        const trimmed = value.trim();
        if (trimmed.startsWith("#")) {
          if (trimmed.length === 4) {
            return ("#" + trimmed[1] + trimmed[1] + trimmed[2] + trimmed[2] + trimmed[3] + trimmed[3]).toLowerCase();
          }
          return trimmed.toLowerCase();
        }
        const match = trimmed.match(/\d+(\.\d+)?/g);
        if (!match || match.length < 3) return "#000000";
        const [r, g, b] = match.slice(0, 3).map((part) => {
          const n = Number(part);
          return Math.max(0, Math.min(255, Math.round(n)));
        });
        return ("#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")).toLowerCase();
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
        subtitle.textContent = `Editing ${getThemeTitle(getCurrentAppTheme2())}`;
      }
      function updatePreview() {
        currentDraft = readDraftFromForm();
        previewThemeOverrides(currentDraft);
      }
      function populateForm() {
        if (!form) return;
        refreshSubtitle();
        const saved = getThemeOverrides(getCurrentAppTheme2());
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
            "margin-bottom:8px"
          ].join(";");
          const label = document.createElement("span");
          label.textContent = TOKEN_LABELS[token] || token;
          const swatch = document.createElement("span");
          swatch.style.cssText = [
            "width: 14px",
            "height: 14px",
            "border: 1px solid var(--border)",
            "background: " + value,
            "display: inline-block"
          ].join(";");
          const color = document.createElement("input");
          color.type = "color";
          color.value = value;
          color.dataset.token = token;
          color.style.cssText = "width: 32px; height: 22px; padding: 0; border: 1px solid var(--border); background: var(--bg-elevated);";
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
            "font-size: var(--font-size-caption)"
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
          type: "application/json"
        });
        const href = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const stamp = payload.themeId.replace(/[^a-z0-9_-]+/gi, "-");
        link.href = href;
        link.download = `agentchattr-theme-${stamp}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(href), 1e3);
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
          "font-family: var(--font-ui)"
        ].join(";");
        const title = document.createElement("div");
        title.textContent = "Theme Settings";
        title.style.cssText = "font: 700 var(--font-size-panel-title)/1.2 var(--font-display); margin-bottom: 4px;";
        subtitle = document.createElement("div");
        subtitle.style.cssText = "font-size: var(--font-size-caption); color: var(--fg-secondary); margin-bottom: 12px;";
        form = document.createElement("div");
        const actions = document.createElement("div");
        actions.style.cssText = "display:flex; gap:8px; flex-wrap:wrap; margin-top: 12px;";
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
            "cursor: pointer"
          ].join(";");
          button.addEventListener("click", onClick);
          return button;
        };
        actions.append(
          makeButton("Save", async () => {
            currentDraft = readDraftFromForm();
            await saveThemeOverrides(getCurrentAppTheme2(), currentDraft);
            populateForm();
          }),
          makeButton("Reset", async () => {
            await resetThemeOverrides(getCurrentAppTheme2());
            populateForm();
          }),
          makeButton("Export", () => {
            const payload = buildThemeExport(getCurrentAppTheme2(), readDraftFromForm());
            downloadExport(payload);
            window.electronAPI?.writeClipboardText?.(JSON.stringify(payload, null, 2));
          }),
          makeButton("Close", () => {
            discardThemeOverridePreview();
            panel.hidden = true;
          })
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
      function mountThemeSettingsButton2(parent) {
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
          "-webkit-app-region: no-drag"
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
      module.exports = { mountThemeSettingsButton: mountThemeSettingsButton2 };
    }
  });

  // renderer/themes/theme-picker.js
  var {
    applyAppTheme,
    getCurrentAppTheme,
    initAppTheme
  } = require_theme_loader();
  var { getAllAppThemes } = require_theme_registry();
  var { mountThemeSettingsButton } = require_theme_settings_panel();
  async function mountThemePicker() {
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
      "font-size: var(--font-size-chrome)",
      "font-family: var(--font-display)",
      "background: var(--bg-elevated)",
      "color: var(--fg-primary)",
      "border: 1px solid var(--border)",
      "border-radius: var(--radius)",
      "cursor: pointer",
      "outline: none",
      "-webkit-app-region: no-drag"
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
    if (window.require) {
      try {
        const { ipcRenderer } = window.require("electron");
        ipcRenderer.on("app-theme-changed", (_event, themeId) => {
          select.value = themeId;
        });
      } catch {
      }
    }
    picker.appendChild(select);
    mountThemeSettingsButton(picker);
    const tabItems = tabBar.querySelectorAll(".tab-item");
    const lastTabItem = tabItems[tabItems.length - 1];
    if (lastTabItem && lastTabItem.nextSibling) {
      tabBar.insertBefore(picker, lastTabItem.nextSibling);
    } else {
      tabBar.appendChild(picker);
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => mountThemePicker());
  } else {
    mountThemePicker();
  }
})();
