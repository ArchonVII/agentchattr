"use strict";

const CHAT_THEME_TOKEN_MAP = {
  "--bg": "--bg-app",
  "--bg-header": "--bg-surface",
  "--bg-input": "--bg-elevated",
  "--bg-msg": "--bg-deep",
  "--bg-msg-hover": "--bg-surface",
  "--bg-elevated": "--bg-elevated",
  "--bg-subtle": "--accent-subtle",
  "--border": "--border",
  "--border-strong": "--border-strong",
  "--border-subtle": "--border",
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

function collectChatThemeVars(readCssVar) {
  const nextVars = {};

  for (const [chatVar, appVar] of Object.entries(CHAT_THEME_TOKEN_MAP)) {
    const value = readCssVar(appVar);
    if (typeof value === "string" && value.trim()) {
      nextVars[chatVar] = value.trim();
    }
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
