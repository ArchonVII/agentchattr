"use strict";

// Terminals renderer — manages xterm.js instances, tab strip, and
// shell picker in the Electron renderer's Terminals tab.

const { Terminal } = require("@xterm/xterm");
const { FitAddon } = require("@xterm/addon-fit");
const { WebLinksAddon } = require("@xterm/addon-web-links");

// ---------------------------------------------------------------------------
// Constants (CASK ordering)
// ---------------------------------------------------------------------------

// xterm.js theme matching the agentchattr dark palette.
// Source: colours from electron/renderer/index.html style block.
const XTERM_THEME = {
  background: "#12121e",
  foreground: "#e0e0e0",
  cursor: "#da7756",
  cursorAccent: "#12121e",
  selectionBackground: "rgba(218, 119, 86, 0.3)",
  black: "#12121e",
  red: "#ff6b6b",
  green: "#4ade80",
  yellow: "#fbbf24",
  blue: "#60a5fa",
  magenta: "#a78bfa",
  cyan: "#22d3ee",
  white: "#e0e0e0",
  brightBlack: "#555",
  brightRed: "#ff8a8a",
  brightGreen: "#86efac",
  brightYellow: "#fcd34d",
  brightBlue: "#93c5fd",
  brightMagenta: "#c4b5fd",
  brightCyan: "#67e8f9",
  brightWhite: "#ffffff",
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const terminalInstances = new Map(); // id -> { terminal, fitAddon, wrapper, surface, name, shell, exited, exitCode, pid }
let activeTerminalId = null;
let availableShells = [];
let layoutMode = "tabs"; // "tabs" or "grid"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getContainer() {
  return document.getElementById("terminals-container");
}

function getWrapper() {
  const container = getContainer();
  if (!container) return null;

  let wrapper = container.querySelector(".terminals-wrapper");
  if (!wrapper) {
    wrapper = document.createElement("div");
    wrapper.className = "terminals-wrapper";
    container.appendChild(wrapper);
  }
  return wrapper;
}

// ---------------------------------------------------------------------------
// Layout management
// ---------------------------------------------------------------------------

function toggleLayout() {
  layoutMode = layoutMode === "tabs" ? "grid" : "tabs";
  renderLayout();
  renderTabStrip();

  // Refit all visible terminals
  for (const inst of terminalInstances.values()) {
    if (layoutMode === "grid" || inst.id === activeTerminalId) {
      // Small delay to let CSS transition/layout settle
      setTimeout(() => inst.fitAddon.fit(), 50);
    }
  }
}

function renderLayout() {
  const wrapper = getWrapper();
  if (!wrapper) return;

  wrapper.classList.toggle("grid-layout", layoutMode === "grid");

  for (const [id, inst] of terminalInstances) {
    const isActive = id === activeTerminalId;
    inst.wrapper.classList.toggle("active", isActive);

    if (layoutMode === "grid") {
      inst.wrapper.style.display = "";
    } else {
      inst.wrapper.style.display = isActive ? "" : "none";
    }
  }

  renderExitedBanner();
}

// ---------------------------------------------------------------------------
// Tab strip
// ---------------------------------------------------------------------------

function renderTabStrip() {
  const container = getContainer();
  if (!container) return;

  let strip = container.querySelector(".terminals-tab-strip");
  if (strip) strip.remove();

  strip = document.createElement("div");
  strip.className = "terminals-tab-strip";

  for (const [id, inst] of terminalInstances) {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "terminal-tab" + (id === activeTerminalId ? " active" : "");
    tab.dataset.id = id;

    const label = document.createElement("span");
    label.className = "terminal-tab-label";
    label.textContent = inst.name || id.slice(0, 8);
    tab.appendChild(label);

    // Double-click to rename
    label.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      const input = document.createElement("input");
      input.type = "text";
      input.value = inst.name;
      input.maxLength = 30;
      input.style.cssText =
        "background:#1f1f31;border:1px solid #da7756;color:#e0e0e0;font-size:12px;font-family:inherit;padding:0 4px;width:100px;border-radius:3px;outline:none;";
      const finish = () => {
        const newName = input.value.trim();
        if (newName) inst.name = newName;
        renderTabStrip();
      };
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") finish();
        if (ev.key === "Escape") renderTabStrip();
      });
      input.addEventListener("blur", finish);
      label.replaceWith(input);
      input.focus();
      input.select();
    });

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "terminal-tab-close";
    closeBtn.textContent = "\u00d7";
    closeBtn.title = "Close terminal";
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      destroyTerminal(id);
    });
    tab.appendChild(closeBtn);

    tab.addEventListener("click", () => focusTerminal(id));
    strip.appendChild(tab);
  }

  // [+] button
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "terminal-tab-add";
  addBtn.textContent = "+";
  addBtn.title = "New terminal";
  addBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleShellMenu(addBtn);
  });
  strip.appendChild(addBtn);

  // Layout toggle button
  const layoutBtn = document.createElement("button");
  layoutBtn.type = "button";
  layoutBtn.className = "terminal-layout-toggle";
  layoutBtn.title = `Switch to ${layoutMode === "tabs" ? "Grid" : "Tabs"} view`;
  layoutBtn.innerHTML =
    layoutMode === "tabs"
      ? '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6"/><rect x="9" y="1" width="6" height="6"/><rect x="1" y="9" width="6" height="6"/><rect x="9" y="9" width="6" height="6"/></svg>'
      : '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="3" width="14" height="10"/></svg>';

  layoutBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleLayout();
  });
  strip.appendChild(layoutBtn);

  container.prepend(strip);
}

// ---------------------------------------------------------------------------
// Shell picker menu
// ---------------------------------------------------------------------------

function toggleShellMenu(anchor) {
  const container = getContainer();
  const existing = container.querySelector(".terminal-shell-menu");
  if (existing) {
    existing.remove();
    return;
  }

  const menu = document.createElement("div");
  menu.className = "terminal-shell-menu";

  if (availableShells.length === 0) {
    const item = document.createElement("div");
    item.style.cssText = "padding:8px 14px;color:#888;font-size:13px;";
    item.textContent = "No shells detected";
    menu.appendChild(item);
  } else {
    for (const shell of availableShells) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "terminal-shell-option";
      btn.textContent = shell.name;
      btn.addEventListener("click", () => {
        menu.remove();
        void requestNewTerminal(shell.id);
      });
      menu.appendChild(btn);
    }
  }

  // Position relative to anchor
  const rect = anchor.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  menu.style.left = rect.left - containerRect.left + "px";

  container.appendChild(menu);

  // Close on outside click
  const closeMenu = (e) => {
    if (!menu.contains(e.target) && e.target !== anchor) {
      menu.remove();
      document.removeEventListener("click", closeMenu);
    }
  };
  setTimeout(() => document.addEventListener("click", closeMenu), 0);
}

// ---------------------------------------------------------------------------
// Terminal lifecycle
// ---------------------------------------------------------------------------

async function requestNewTerminal(shellId) {
  if (!window.electronAPI?.createTerminal) return;

  const result = await window.electronAPI.createTerminal({
    shell: shellId || undefined,
  });

  if (result?.error) {
    console.error("Failed to create terminal:", result.error);
    return;
  }

  if (result?.id) {
    createXtermInstance(result.id, result.name, result.shell);
    focusTerminal(result.id);
  }
}

function createXtermInstance(id, name, shell, pid) {
  const terminal = new Terminal({
    theme: XTERM_THEME,
    fontFamily: 'Consolas, "Courier New", monospace',
    fontSize: 13,
    cursorBlink: true,
    cursorStyle: "bar",
    scrollback: 5000,
  });

  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.loadAddon(new WebLinksAddon());

  // Create Wrapper
  const wrapper = document.createElement("div");
  wrapper.className = "terminal-instance-wrapper";
  wrapper.dataset.terminalId = id;

  // Create Toolbar
  const toolbar = document.createElement("div");
  toolbar.className = "terminal-toolbar";

  // Toolbar Content
  const nameLabel = document.createElement("div");
  nameLabel.className = "terminal-status";
  nameLabel.style.marginRight = "12px";
  nameLabel.textContent = name || shell;
  toolbar.appendChild(nameLabel);

  // Clear Button
  const clearBtn = createToolbarBtn("Clear", () => terminal.clear());
  toolbar.appendChild(clearBtn);

  // Restart Button
  const restartBtn = createToolbarBtn("Restart", () => {
    destroyTerminal(id);
    void requestNewTerminal(shell);
  });
  toolbar.appendChild(restartBtn);

  // Copy All Button
  const copyBtn = createToolbarBtn("Copy All", () => {
    const text = getTerminalText(terminal);
    if (text) {
      navigator.clipboard.writeText(text);
      copyBtn.textContent = "Copied!";
      setTimeout(() => (copyBtn.textContent = "Copy All"), 2000);
    }
  });
  toolbar.appendChild(copyBtn);

  // Explain Button (AI Integration)
  const explainBtn = createToolbarBtn("Explain Output", () => {
    const text = getTerminalText(terminal, 100); // Last 100 lines
    if (text) explainTerminalOutput(text, name || shell);
  });
  explainBtn.style.color = "#da7756";
  explainBtn.style.borderColor = "rgba(218, 119, 86, 0.4)";
  toolbar.appendChild(explainBtn);

  toolbar.appendChild(document.createElement("div")).className =
    "terminal-toolbar-spacer";

  if (pid) {
    const pidLabel = document.createElement("div");
    pidLabel.className = "terminal-status";
    pidLabel.textContent = `PID: ${pid}`;
    toolbar.appendChild(pidLabel);
  }

  wrapper.appendChild(toolbar);

  // Create Surface
  const surface = document.createElement("div");
  surface.className = "terminal-surface";
  wrapper.appendChild(surface);

  // Respect layout mode for initial display
  if (layoutMode === "grid") {
    wrapper.style.display = "";
  } else {
    wrapper.style.display = "none";
  }

  const mainWrapper = getWrapper();
  if (mainWrapper) mainWrapper.appendChild(wrapper);

  terminal.open(surface);
  fitAddon.fit();

  // Send keystrokes to the pty
  terminal.onData((data) => {
    window.electronAPI?.sendTerminalInput(id, data);
  });

  // Notify pty of resize
  terminal.onResize(({ cols, rows }) => {
    window.electronAPI?.resizeTerminal(id, cols, rows);
  });

  terminalInstances.set(id, {
    terminal,
    fitAddon,
    wrapper,
    surface,
    name: name || shell || id.slice(0, 8),
    shell,
    pid,
    exited: false,
    exitCode: null,
  });

  renderTabStrip();
  renderEmptyState();
}

function createToolbarBtn(text, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "terminal-toolbar-btn";
  btn.textContent = text;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return btn;
}

function getTerminalText(terminal, maxLines = null) {
  const buffer = terminal.buffer.active;
  let text = "";
  const start = maxLines ? Math.max(0, buffer.length - maxLines) : 0;
  for (let i = start; i < buffer.length; i++) {
    const line = buffer.getLine(i);
    if (line) text += line.translateToString(true) + "\n";
  }
  return text.trim();
}

function explainTerminalOutput(text, context) {
  // Use the global function defined in renderer.js or terminal-presence.js
  // to send a message to the chat agent.
  const chatWebview = document.getElementById("chat-webview");
  if (!chatWebview) return;

  const prompt = `I need help explaining the following output from my ${context} terminal:\n\n\`\`\`\n${text}\n\`\`\``;

  // We use a custom event or direct execution to send this to the agent
  const script = `
    (() => {
      if (window.ChatApp && typeof window.ChatApp.appendSystemMessage === 'function') {
         window.ChatApp.appendSystemMessage('Asking agent to explain terminal output...');
      }
      // Simulate user input
      const input = document.querySelector('textarea') || document.querySelector('input[type="text"]');
      if (input) {
        input.value = ${JSON.stringify(prompt)};
        input.dispatchEvent(new Event('input', { bubbles: true }));
        // Try to find and click submit button
        const submit = document.querySelector('button[type="submit"]') || document.querySelector('.send-button');
        if (submit) submit.click();
      }
    })();
  `;

  try {
    chatWebview.executeJavaScript(script);
    // Switch to chat tab
    if (typeof activateTab === "function") activateTab("chat");
  } catch (e) {
    console.error("Failed to send terminal output to chat:", e);
  }
}

function focusTerminal(id) {
  if (!terminalInstances.has(id)) return;

  activeTerminalId = id;

  // Update visibility based on layout mode
  renderLayout();

  const active = terminalInstances.get(id);
  if (active) {
    active.fitAddon.fit();
    active.terminal.focus();
  }

  renderExitedBanner();
  renderTabStrip();
}

function destroyTerminal(id) {
  const inst = terminalInstances.get(id);
  if (!inst) return;

  window.electronAPI?.closeTerminal(id);
  inst.terminal.dispose();
  inst.wrapper.remove();
  terminalInstances.delete(id);

  if (activeTerminalId === id) {
    const remaining = [...terminalInstances.keys()];
    activeTerminalId =
      remaining.length > 0 ? remaining[remaining.length - 1] : null;

    if (activeTerminalId) {
      focusTerminal(activeTerminalId);
    }
  }

  renderExitedBanner();
  renderTabStrip();
  renderEmptyState();
}

// ---------------------------------------------------------------------------
// Exited banner
// ---------------------------------------------------------------------------

function renderExitedBanner() {
  const container = getContainer();
  let banner = container.querySelector(".terminal-exited-banner");

  const active = activeTerminalId
    ? terminalInstances.get(activeTerminalId)
    : null;

  if (!active || !active.exited) {
    if (banner) banner.remove();
    return;
  }

  if (!banner) {
    banner = document.createElement("div");
    banner.className = "terminal-exited-banner";
    container.appendChild(banner);
  }

  banner.innerHTML = "";

  const msg = document.createElement("span");
  msg.textContent = `Terminal exited (code ${active.exitCode ?? "?"})`;
  banner.appendChild(msg);

  const restartBtn = document.createElement("button");
  restartBtn.textContent = "Restart";
  restartBtn.addEventListener("click", () => {
    const shell = active.shell;
    destroyTerminal(activeTerminalId);
    void requestNewTerminal(shell);
  });
  banner.appendChild(restartBtn);

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "Close";
  closeBtn.addEventListener("click", () => {
    destroyTerminal(activeTerminalId);
  });
  banner.appendChild(closeBtn);
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function renderEmptyState() {
  const container = getContainer();
  let empty = container.querySelector(".terminal-empty");

  if (terminalInstances.size > 0) {
    if (empty) empty.remove();
    return;
  }

  if (!empty) {
    empty = document.createElement("div");
    empty.className = "terminal-empty";
    empty.textContent = 'Click "+" to open a terminal session.';
    container.appendChild(empty);
  }
}

// ---------------------------------------------------------------------------
// IPC event handlers
// ---------------------------------------------------------------------------

function handleTerminalOutput({ id, data }) {
  const inst = terminalInstances.get(id);
  if (inst) {
    inst.terminal.write(data);
  }
}

function handleTerminalExited({ id, exitCode }) {
  const inst = terminalInstances.get(id);
  if (inst) {
    inst.exited = true;
    inst.exitCode = exitCode;
    inst.terminal.write(
      `\r\n\x1b[90m[Process exited with code ${exitCode ?? "?"}]\x1b[0m\r\n`,
    );

    if (activeTerminalId === id) {
      renderExitedBanner();
    }

    renderTabStrip();
  }
}

// ---------------------------------------------------------------------------
// Resize handling
// ---------------------------------------------------------------------------

function handleResize() {
  if (!activeTerminalId) return;
  const inst = terminalInstances.get(activeTerminalId);
  if (inst) {
    inst.fitAddon.fit();
  }
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

async function initTerminals() {
  // Detect available shells
  if (window.electronAPI?.listShells) {
    try {
      availableShells = await window.electronAPI.listShells();
    } catch {
      availableShells = [];
    }
  }

  // Listen for pty output and exit events
  window.electronAPI?.onTerminalOutput(handleTerminalOutput);
  window.electronAPI?.onTerminalExited(handleTerminalExited);

  // Handle container resize
  const container = getContainer();
  if (container) {
    const observer = new ResizeObserver(() => handleResize());
    observer.observe(container);
  }

  renderTabStrip();
  renderEmptyState();
}

// ---------------------------------------------------------------------------
// Global hook for presence panel click-through (Phase B integration)
// ---------------------------------------------------------------------------

window._focusEmbeddedTerminal = (id) => {
  if (!terminalInstances.has(id)) return;
  // Switch to the Terminals tab (activateTab is global in renderer.js)
  if (typeof activateTab === "function") {
    activateTab("terminals");
  }
  focusTerminal(id);
};

// ---------------------------------------------------------------------------
// Window exports
// ---------------------------------------------------------------------------

window.Terminals = {
  init: initTerminals,
  focus: focusTerminal,
  requestNew: requestNewTerminal,
};
