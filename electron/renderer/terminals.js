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

const terminalInstances = new Map(); // id -> { ..., x, y, width, height, zIndex }
let activeTerminalId = null;
let availableShells = [];
let layoutMode = "tabs"; // "tabs", "grid", or "float"
let arsenalVisible = true;
let highestZ = 1; // z-index counter for floating mode

// Quick Launch state
let quickLaunchFolders = [];
let selectedLaunchFolder = null;
let skipPermissions = true;

// Drag/Resize state
let actionState = {
  isDragging: false,
  isResizing: false,
  targetId: null,
  startX: 0,
  startY: 0,
  startLeft: 0,
  startTop: 0,
  startWidth: 0,
  startHeight: 0,
};

// ---------------------------------------------------------------------------
// Quick Launch Logic
// ---------------------------------------------------------------------------

function renderQuickLaunchBar() {
  const bar = document.getElementById("quick-launch-bar");
  if (!bar) return;

  bar.innerHTML = "";

  // Folder shortcuts
  quickLaunchFolders.forEach((folder) => {
    const btn = document.createElement("button");
    btn.className =
      "quick-launch-folder" +
      (selectedLaunchFolder === folder ? " active" : "");
    btn.textContent = folder.split(/[\\/]/).pop();
    btn.title = folder;
    btn.onclick = () => {
      selectedLaunchFolder = folder;
      renderQuickLaunchBar();
    };
    bar.appendChild(btn);
  });

  // Add folder button
  if (quickLaunchFolders.length < 5) {
    const addBtn = document.createElement("button");
    addBtn.className = "quick-launch-folder";
    addBtn.textContent = "+ Folder";
    addBtn.onclick = async () => {
      const folder = await window.electronAPI.selectFolder();
      if (folder && !quickLaunchFolders.includes(folder)) {
        quickLaunchFolders.push(folder);
        selectedLaunchFolder = folder;
        renderQuickLaunchBar();
      }
    };
    bar.appendChild(addBtn);
  }

  const divider = document.createElement("div");
  divider.className = "quick-launch-divider";
  bar.appendChild(divider);

  // Agent buttons
  const agents = [
    { id: "claude", label: "C" },
    { id: "codex", label: "D" },
    { id: "gemini", label: "G" },
  ];

  agents.forEach((agent) => {
    const btn = document.createElement("button");
    btn.className = "quick-launch-agent-btn";
    btn.textContent = agent.label;
    btn.title = `Launch ${agent.id.charAt(0).toUpperCase() + agent.id.slice(1)}`;
    btn.onclick = () => launchAgentTerminal(agent.id);
    bar.appendChild(btn);
  });

  bar.appendChild(divider.cloneNode());

  // Permissions checkbox
  const permsLabel = document.createElement("label");
  permsLabel.className = "quick-launch-perms";
  const permsCheck = document.createElement("input");
  permsCheck.type = "checkbox";
  permsCheck.checked = skipPermissions;
  permsCheck.onchange = (e) => {
    skipPermissions = e.target.checked;
  };
  permsLabel.appendChild(permsCheck);
  permsLabel.appendChild(document.createTextNode("Skip Permissions"));
  bar.appendChild(permsLabel);
}

function launchAgentTerminal(agentId) {
  if (!selectedLaunchFolder) {
    alert("Please select or add a project folder first.");
    return;
  }

  const isWin = navigator.userAgent.includes("Windows");
  const ext = isWin ? ".bat" : ".sh";
  let scriptName = `start_${agentId}`;

  if (skipPermissions) {
    if (agentId === "claude") scriptName = "start_claude_skip-permissions";
    if (agentId === "codex") scriptName = "start_codex_bypass";
    if (agentId === "gemini") scriptName = "start_gemini_yolo";
  }

  const command = `${isWin ? "windows\\" : "macos-linux/"}${scriptName}${ext}`;

  void requestNewTerminal(null, {
    cwd: selectedLaunchFolder,
    command: command,
    name: `${agentId.toUpperCase()} - ${selectedLaunchFolder.split(/[\\/]/).pop()}`,
  });
}

// ---------------------------------------------------------------------------
// Window Action Handlers (Drag, Resize, Focus)
// ---------------------------------------------------------------------------

function initDrag(e, id) {
  e.preventDefault();
  e.stopPropagation();

  const inst = terminalInstances.get(id);
  if (!inst) return;

  bringToFront(id);

  actionState = {
    isDragging: true,
    isResizing: false,
    targetId: id,
    startX: e.clientX,
    startY: e.clientY,
    startLeft: inst.x,
    startTop: inst.y,
  };

  window.addEventListener("mousemove", performDrag);
  window.addEventListener("mouseup", endDrag);
}

function performDrag(e) {
  if (!actionState.isDragging || !actionState.targetId) return;
  e.preventDefault();

  const inst = terminalInstances.get(actionState.targetId);
  if (!inst) return;

  const dx = e.clientX - actionState.startX;
  const dy = e.clientY - actionState.startY;

  inst.x = actionState.startLeft + dx;
  inst.y = actionState.startTop + dy;

  inst.wrapper.style.left = inst.x + "px";
  inst.wrapper.style.top = inst.y + "px";
}

function endDrag() {
  actionState.isDragging = false;
  actionState.targetId = null;
  window.removeEventListener("mousemove", performDrag);
  window.removeEventListener("mouseup", endDrag);
}

function initResize(e, id) {
  e.preventDefault();
  e.stopPropagation();

  const inst = terminalInstances.get(id);
  if (!inst) return;

  bringToFront(id);

  actionState = {
    isDragging: false,
    isResizing: true,
    targetId: id,
    startX: e.clientX,
    startY: e.clientY,
    startWidth: inst.width,
    startHeight: inst.height,
  };

  window.addEventListener("mousemove", performResize);
  window.addEventListener("mouseup", endResize);
}

function performResize(e) {
  if (!actionState.isResizing || !actionState.targetId) return;
  e.preventDefault();

  const inst = terminalInstances.get(actionState.targetId);
  if (!inst) return;

  const dx = e.clientX - actionState.startX;
  const dy = e.clientY - actionState.startY;

  inst.width = Math.max(300, actionState.startWidth + dx);
  inst.height = Math.max(200, actionState.startHeight + dy);

  inst.wrapper.style.width = inst.width + "px";
  inst.wrapper.style.height = inst.height + "px";

  if (inst.fitTimeout) clearTimeout(inst.fitTimeout);
  inst.fitTimeout = setTimeout(() => inst.fitAddon.fit(), 50);
}

function endResize() {
  actionState.isResizing = false;
  actionState.targetId = null;
  window.removeEventListener("mousemove", performResize);
  window.removeEventListener("mouseup", endResize);
}

function bringToFront(id) {
  if (!terminalInstances.has(id)) return;

  const inst = terminalInstances.get(id);
  highestZ++;
  inst.zIndex = highestZ;

  focusTerminal(id);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getContainer() {
  return document.getElementById("terminals-container");
}

function getTerminalsMain() {
  const container = getContainer();
  if (!container) return null;

  let main = container.querySelector(".terminals-main");
  if (!main) {
    main = document.createElement("div");
    main.className = "terminals-main";
    container.appendChild(main);
  }
  return main;
}

function getWrapper() {
  const main = getTerminalsMain();
  if (!main) return null;

  let wrapper = main.querySelector(".terminals-wrapper");
  if (!wrapper) {
    wrapper = document.createElement("div");
    wrapper.className = "terminals-wrapper";
    main.appendChild(wrapper);
  }
  return wrapper;
}

function getArsenal() {
  const main = getTerminalsMain();
  if (!main) return null;

  let arsenal = main.querySelector(".arsenal-sidebar");
  if (!arsenal) {
    arsenal = document.createElement("aside");
    arsenal.className = "arsenal-sidebar";
    if (!arsenalVisible) arsenal.classList.add("collapsed");
    main.appendChild(arsenal);
    renderArsenal();
  }
  return arsenal;
}

// ---------------------------------------------------------------------------
// Arsenal Sidebar
// ---------------------------------------------------------------------------

function toggleArsenal() {
  arsenalVisible = !arsenalVisible;
  const arsenal = getArsenal();
  if (arsenal) {
    arsenal.classList.toggle("collapsed", !arsenalVisible);
  }
  renderTabStrip();

  for (const inst of terminalInstances.values()) {
    if (layoutMode === "grid" || inst.id === activeTerminalId) {
      setTimeout(() => inst.fitAddon.fit(), 50);
    }
  }
}

function renderArsenal() {
  const main = getTerminalsMain();
  if (!main) return;

  const arsenal = main.querySelector(".arsenal-sidebar");
  if (!arsenal) return;

  arsenal.innerHTML = `
    <div class="arsenal-header">
      <span>Arsenal</span>
      <button class="terminal-settings-toggle" title="Close Arsenal" onclick="window.Terminals.toggleArsenal()">\u00d7</button>
    </div>
    <div class="arsenal-content"></div>
  `;

  const content = arsenal.querySelector(".arsenal-content");
  const config = window.TerminalConfig || { commands: [] };

  for (const cat of config.commands) {
    const catDiv = document.createElement("div");
    catDiv.className = "arsenal-category";
    catDiv.innerHTML = `<div class="arsenal-cat-title">${cat.category}</div>`;

    for (const item of cat.items) {
      const btn = document.createElement("button");
      btn.className = "arsenal-item";
      btn.textContent = item.name;
      btn.addEventListener("click", () => {
        if (activeTerminalId) {
          window.electronAPI?.sendTerminalInput(activeTerminalId, item.cmd);
        }
      });
      catDiv.appendChild(btn);
    }
    content.appendChild(catDiv);
  }
}

// ---------------------------------------------------------------------------
// Macro Bar
// ---------------------------------------------------------------------------

function createMacroBar(id) {
  const bar = document.createElement("div");
  bar.className = "terminal-macro-bar";

  const config = window.TerminalConfig || { macros: [] };

  for (const macro of config.macros) {
    const btn = document.createElement("button");
    btn.className = `macro-btn ${macro.color || ""}`;
    btn.textContent = macro.label;
    btn.addEventListener("click", () => {
      window.electronAPI?.sendTerminalInput(id, macro.command);
    });
    bar.appendChild(btn);
  }

  const themeSelect = document.createElement("select");
  themeSelect.className = "macro-btn";
  themeSelect.style.marginLeft = "auto";
  themeSelect.innerHTML = `
    <option value="default">Default Theme</option>
    <option value="cyberpunk">Cyberpunk</option>
    <option value="matrix">Matrix</option>
    <option value="dracula">Dracula</option>
  `;
  themeSelect.addEventListener("change", (e) => {
    toggleTheme(id, e.target.value);
  });
  bar.appendChild(themeSelect);

  return bar;
}

function toggleTheme(id, themeName) {
  const inst = terminalInstances.get(id);
  if (!inst) return;

  const themes = window.TerminalConfig?.themes || {};
  const theme = themes[themeName] || themes.default;
  if (!theme) return;

  inst.terminal.options.theme = {
    background: theme.background,
    foreground: theme.foreground,
    cursor: theme.cursor,
    selectionBackground: "rgba(218, 119, 86, 0.3)",
  };
  inst.theme = themeName;
}

// ---------------------------------------------------------------------------
// Layout management
// ---------------------------------------------------------------------------

function toggleLayout() {
  const modes = ["tabs", "grid", "float"];
  const currentIndex = modes.indexOf(layoutMode);
  layoutMode = modes[(currentIndex + 1) % modes.length];

  renderLayout();
  renderTabStrip();

  for (const inst of terminalInstances.values()) {
    setTimeout(() => inst.fitAddon.fit(), 50);
  }
}

function renderLayout() {
  const wrapper = getWrapper();
  if (!wrapper) return;

  wrapper.classList.toggle("grid-layout", layoutMode === "grid");
  wrapper.classList.toggle("float-layout", layoutMode === "float");

  for (const [id, inst] of terminalInstances) {
    const isActive = id === activeTerminalId;
    inst.wrapper.classList.toggle("active", isActive);

    inst.wrapper.style.display = "";
    inst.wrapper.style.position = "";
    inst.wrapper.style.top = "";
    inst.wrapper.style.left = "";
    inst.wrapper.style.width = "";
    inst.wrapper.style.height = "";
    inst.wrapper.style.zIndex = "";
    if (inst.macroBar) inst.macroBar.style.display = "flex";

    if (layoutMode === "tabs") {
      inst.wrapper.style.display = isActive ? "" : "none";
    } else if (layoutMode === "grid") {
      if (inst.macroBar) inst.macroBar.style.display = "none";
      if (inst.toolbar) inst.toolbar.style.display = "none";
    } else if (layoutMode === "float") {
      inst.wrapper.style.position = "absolute";
      inst.wrapper.style.left = inst.x + "px";
      inst.wrapper.style.top = inst.y + "px";
      inst.wrapper.style.width = inst.width + "px";
      inst.wrapper.style.height = inst.height + "px";
      inst.wrapper.style.zIndex = inst.zIndex;
      if (inst.toolbar) inst.toolbar.style.display = "flex";
    }
  }
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

  // Bridge: watcher settings gear button
  const watcherBtn = document.createElement("button");
  watcherBtn.type = "button";
  watcherBtn.className = "terminal-settings-toggle";
  watcherBtn.title = "Watcher Settings";
  watcherBtn.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z"/><path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.421 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.421-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.319z"/></svg>';
  watcherBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    window.bridgeUI?.toggleSettings();
  });
  strip.appendChild(watcherBtn);

  const arsenalBtn = document.createElement("button");
  arsenalBtn.type = "button";
  arsenalBtn.className =
    "terminal-settings-toggle" + (arsenalVisible ? " active" : "");
  arsenalBtn.title = "Toggle Arsenal Sidebar";
  arsenalBtn.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1 2.5a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-13a.5.5 0 0 1-.5-.5v-1zm0 5a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-13a.5.5 0 0 1-.5-.5v-1zm0 5a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-13a.5.5 0 0 1-.5-.5v-1z"/></svg>';
  arsenalBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleArsenal();
  });
  strip.appendChild(arsenalBtn);

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

  const rect = anchor.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  menu.style.left = rect.left - containerRect.left + "px";

  container.appendChild(menu);

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

async function requestNewTerminal(shellId, opts = {}) {
  if (!window.electronAPI?.createTerminal) return;

  const result = await window.electronAPI.createTerminal({
    shell: shellId || undefined,
    ...opts,
  });

  if (result?.error) {
    console.error("Failed to create terminal:", result.error);
    return;
  }

  if (result?.id) {
    createXtermInstance(
      result.id,
      result.name,
      result.shell,
      result.pid,
      result.cwd,
    );
    focusTerminal(result.id);
  }
}

function createXtermInstance(id, name, shell, pid, cwd) {
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

  // Local File Link Provider
  terminal.registerLinkProvider({
    provideLinks(bufferLine, callback) {
      const line = bufferLine.translateToString(true);
      // Regex matches:
      // 1. Absolute paths (Unix/Windows)
      // 2. Relative paths (./ or ../)
      // 3. Paths starting with a directory (e.g. src/main.js)
      // and optional line numbers.
      const regex =
        /(?:(?:\/|[A-Za-z]:[\\\/])[\w\-.\\\/]+|(?:\.\.?[\/\\])[\w\-.\\\/]+|[\w\-.]+(?:[\\\/][\w\-.\\\/]+)+)(?::(\d+))?/g;
      const links = [];
      let match;
      while ((match = regex.exec(line)) !== null) {
        const text = match[0];
        const lineNum = match[1];
        const filePath = lineNum ? text.slice(0, text.lastIndexOf(":")) : text;

        const startColumn = match.index + 1;
        const endColumn = startColumn + text.length;

        links.push({
          range: {
            start: { x: startColumn, y: bufferLine.y + 1 },
            end: { x: endColumn, y: bufferLine.y + 1 },
          },
          text,
          activate: (event, text) => {
            window.electronAPI?.openTerminalFile?.({
              path: filePath,
              line: lineNum,
              cwd: cwd,
            });
          },
        });
      }
      callback(links);
    },
  });

  const wrapper = document.createElement("div");
  wrapper.className = "terminal-instance-wrapper";
  wrapper.dataset.terminalId = id;
  wrapper.addEventListener("mousedown", () => bringToFront(id), true);

  const toolbar = document.createElement("div");
  toolbar.className = "terminal-toolbar";
  toolbar.addEventListener("mousedown", (e) => initDrag(e, id));

  const resizeHandle = document.createElement("div");
  resizeHandle.className = "resize-handle bottom-right";
  resizeHandle.addEventListener("mousedown", (e) => initResize(e, id));
  wrapper.appendChild(resizeHandle);

  const macroBar = createMacroBar(id);
  wrapper.appendChild(macroBar);

  const surface = document.createElement("div");
  surface.className = "terminal-surface";
  wrapper.appendChild(surface);

  const mainWrapper = getWrapper();
  if (mainWrapper) mainWrapper.appendChild(wrapper);

  terminal.open(surface);
  fitAddon.fit();

  terminal.onData((data) => {
    window.electronAPI?.sendTerminalInput(id, data);
  });

  terminal.onResize(({ cols, rows }) => {
    window.electronAPI?.resizeTerminal(id, cols, rows);
  });

  const numInstances = terminalInstances.size;
  const newInstance = {
    terminal,
    fitAddon,
    wrapper,
    toolbar,
    surface,
    macroBar,
    name: name || shell || id.slice(0, 8),
    shell,
    pid,
    exited: false,
    exitCode: null,
    x: 20 + numInstances * 25,
    y: 20 + numInstances * 25,
    width: 600,
    height: 400,
    zIndex: highestZ++,
    fitTimeout: null,
  };

  terminalInstances.set(id, newInstance);

  renderLayout();
  renderTabStrip();
  renderEmptyState();
}

function focusTerminal(id) {
  if (!terminalInstances.has(id)) return;

  activeTerminalId = id;
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

function handleResize() {
  if (!activeTerminalId) return;
  const inst = terminalInstances.get(activeTerminalId);
  if (inst) {
    inst.fitAddon.fit();
  }
}

async function initTerminals() {
  if (window.electronAPI?.listShells) {
    try {
      availableShells = await window.electronAPI.listShells();
    } catch {
      availableShells = [];
    }
  }

  window.electronAPI?.onTerminalOutput(handleTerminalOutput);
  window.electronAPI?.onTerminalExited(handleTerminalExited);

  const container = getContainer();
  if (container) {
    const observer = new ResizeObserver(() => handleResize());
    observer.observe(container);
  }

  renderArsenal();
  renderQuickLaunchBar();
  renderTabStrip();
  renderEmptyState();
}

window._focusEmbeddedTerminal = (id) => {
  if (!terminalInstances.has(id)) return;
  if (typeof activateTab === "function") {
    activateTab("terminals");
  }
  focusTerminal(id);
};

window.Terminals = {
  init: initTerminals,
  focus: focusTerminal,
  requestNew: requestNewTerminal,
  toggleArsenal: toggleArsenal,
  toggleTheme: toggleTheme,
  toggleLayout: toggleLayout,
};
