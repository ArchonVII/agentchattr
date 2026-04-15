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
          font: null
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

  // renderer/themes/theme-loader.js
  var require_theme_loader = __commonJS({
    "renderer/themes/theme-loader.js"(exports, module) {
      "use strict";
      var { getAppTheme, getAllAppThemes: getAllAppThemes2 } = require_theme_registry();
      var _currentThemeId = "default";
      var _loadedFonts = /* @__PURE__ */ new Set();
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
      module.exports = {
        applyAppTheme: applyAppTheme2,
        getCurrentAppTheme: getCurrentAppTheme2,
        getAllAppThemes: getAllAppThemes2,
        initAppTheme: initAppTheme2
      };
    }
  });

  // renderer/themes/theme-picker.js
  var {
    applyAppTheme,
    getCurrentAppTheme,
    initAppTheme
  } = require_theme_loader();
  var { getAllAppThemes } = require_theme_registry();
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
      "font-size: 11px",
      "font-family: var(--font-ui)",
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
