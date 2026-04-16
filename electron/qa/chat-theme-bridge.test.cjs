const test = require("node:test");
const assert = require("node:assert/strict");

const {
  CHAT_THEME_TOKEN_MAP,
  collectChatThemeVars,
  buildApplyChatThemeScript,
} = require("../renderer/chat-theme-bridge.js");

test("collectChatThemeVars maps app-shell variables onto chat theme tokens", () => {
  const vars = collectChatThemeVars((name) => {
    const values = {
      "--bg-app": "#12121e",
      "--bg-surface": "#1a1a2e",
      "--bg-elevated": "#1f1f31",
      "--bg-deep": "#171726",
      "--border": "#2a2a3a",
      "--border-strong": "#3a3a4a",
      "--surface-hover": "rgba(255, 255, 255, 0.05)",
      "--control-hover-fg": "#fff2eb",
      "--state-danger-fg": "#ffb5b5",
      "--panel-shadow-strong": "0 8px 40px rgba(0, 0, 0, 0.5)",
      "--font-ui": "\"Perfect DOS VGA 437 Win\", monospace",
      "--font-display": "\"Perfect DOS VGA 437 Win\", monospace",
      "--font-decorative": "\"Perfect DOS VGA 437 Win\", monospace",
      "--font-mono": "\"Perfect DOS VGA 437 Win\", monospace",
      "--font-size-base": "14px",
      "--fg-primary": "#e0e0e0",
      "--fg-secondary": "#b4b4c3",
      "--fg-muted": "#888",
      "--accent": "#da7756",
      "--accent-subtle": "rgba(218, 119, 86, 0.15)",
      "--accent-hover-bg": "rgba(218, 119, 86, 0.1)",
      "--accent-success": "#4ade80",
      "--accent-danger": "#ff6b6b",
    };
    return values[name] || "";
  });

  assert.equal(CHAT_THEME_TOKEN_MAP["--bg"], "--bg-app");
  assert.equal(vars["--bg"], "#12121e");
  assert.equal(vars["--bg-header"], "#1a1a2e");
  assert.equal(vars["--surface-hover"], "rgba(255, 255, 255, 0.05)");
  assert.equal(vars["--control-hover-fg"], "#fff2eb");
  assert.equal(vars["--state-danger-fg"], "#ffb5b5");
  assert.equal(vars["--panel-shadow-strong"], "0 8px 40px rgba(0, 0, 0, 0.5)");
  assert.equal(vars["--font-ui"], "\"Perfect DOS VGA 437 Win\", monospace");
  assert.equal(vars["--font-mono"], "\"Perfect DOS VGA 437 Win\", monospace");
  assert.equal(vars["--font-size-base"], "14px");
  assert.equal(vars["--text"], "#e0e0e0");
  assert.equal(vars["--text-dim"], "#b4b4c3");
  assert.equal(vars["--accent"], "#da7756");
  assert.equal(vars["--success"], "#4ade80");
  assert.equal(vars["--danger"], "#ff6b6b");
});

test("buildApplyChatThemeScript writes the mapped variables into the chat document", () => {
  const script = buildApplyChatThemeScript("win98");

  assert.match(script, /applySharedTheme/);
  assert.match(script, /win98/);
});
