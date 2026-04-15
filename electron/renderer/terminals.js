"use strict";

// Terminals renderer — manages xterm.js instances, tab strip, and
// shell picker in the Electron renderer's Terminals tab.

const { Terminal } = require("@xterm/xterm");
const { FitAddon } = require("@xterm/addon-fit");
const { WebLinksAddon } = require("@xterm/addon-web-links");
const { getTheme, loadThemeFont } = require("./terminal-themes");
const {
  createScanlineOverlay,
  applyCRTGlow,
  wrapMonitorBorder,
  removeAllEffects,
} = require("./terminal-effects");
const {
  createThemeSelector,
  createTuningButton,
} = require("./terminal-theme-ui");
const { getCurrentAppTheme } = require("./themes/theme-loader");
const { getAppTheme } = require("./themes/theme-registry");

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

  // Bridge: agent identity dropdown
  const agentSelect = document.createElement("select");
  agentSelect.className = "macro-btn";
  agentSelect.title = "Assign agent identity";
  agentSelect.innerHTML = `
    <option value="">Agent...</option>
    <option value="claude">Claude</option>
    <option value="codex">Codex</option>
    <option value="gemini">Gemini</option>
    <option value="qwen">Qwen</option>
    <option value="copilot">Copilot</option>
  `;
  agentSelect.dataset.terminalId = id;
  agentSelect.addEventListener("change", (e) => {
    const agentName = e.target.value || null;
    window.electronAPI?.setTerminalIdentity(id, agentName, undefined);
  });
  bar.appendChild(agentSelect);

  // Bridge: snapshot camera button
  const snapshotBtn = document.createElement("button");
  snapshotBtn.className = "macro-btn";
  snapshotBtn.title = "Send last 50 lines to chat";
  snapshotBtn.innerHTML = "&#x1F4F7; Snapshot";
  snapshotBtn.style.marginLeft = "auto";
  snapshotBtn.addEventListener("click", () => {
    window.bridgeUI?.requestSnapshot(id);
  });
  bar.appendChild(snapshotBtn);

  const themeSelect = createThemeSelector(id, applyTheme);
  bar.appendChild(themeSelect);

  const tuningBtn = createTuningButton(id, (tid) => terminalInstances.get(tid));
  bar.appendChild(tuningBtn);

  return bar;
}

// ---------------------------------------------------------------------------
// Theme application
// ---------------------------------------------------------------------------

async function applyTheme(id, themeId) {
  const inst = terminalInstances.get(id);
  if (!inst) return;

  const theme = getTheme(themeId);

  // Clean up existing effects before applying new theme
  removeAllEffects(inst.effectsState);

  // Load custom font if needed
  await loadThemeFont(theme.font);

  // Apply xterm.js theme (full 16-colour palette)
  inst.terminal.options.theme = theme.xterm;

  // Apply font
  const fontFamily = theme.font.file
    ? `"${theme.font.family}", ${theme.font.fallback ? `"${theme.font.fallback}", ` : ""}monospace`
    : theme.font.family;
  inst.terminal.options.fontFamily = fontFamily;
  inst.terminal.options.fontSize = theme.font.size;

  // Apply cursor style
  inst.terminal.options.cursorStyle = theme.cursor.style;
  inst.terminal.options.cursorBlink = theme.cursor.blink;

  // Apply tuning defaults (user can override via popover)
  inst.terminal.options.lineHeight = theme.tuning.lineHeight;
  inst.terminal.options.letterSpacing = theme.tuning.letterSpacing;

  // Initialise tuning state from theme defaults
  inst.tuning = {
    fontSize: theme.font.size,
    lineHeight: theme.tuning.lineHeight,
    letterSpacing: theme.tuning.letterSpacing,
    glowIntensity: 50, // 50% default glow — design spec
    scanlineOpacity: 30, // 30% default scanline — design spec
    scanlines: false,
    border: theme.effects.border.enabled,
  };

  // Apply effects
  if (theme.effects.glow.enabled) {
    inst.effectsState.glow = applyCRTGlow(
      inst.surface,
      theme.effects.glow.color,
      theme.effects.glow.radius,
    );
  }

  if (theme.effects.border.enabled) {
    inst.effectsState.border = wrapMonitorBorder(
      inst.surface,
      theme.effects.border.color,
      theme.effects.border.width,
    );
  }

  // Apply chrome styling
  _applyChromeTheme(inst, theme);

  // Store theme ID
  inst.theme = themeId;

  // Refit terminal after font/spacing changes (50ms debounce for DOM update)
  setTimeout(() => inst.fitAddon.fit(), 50);
}

function _applyChromeTheme(inst, theme) {
  const { chrome } = theme;
  if (!chrome) return;

  // Toolbar background
  if (inst.macroBar && chrome.toolbarBg) {
    inst.macroBar.style.backgroundColor = chrome.toolbarBg;
  } else if (inst.macroBar) {
    inst.macroBar.style.backgroundColor = "";
  }

  // Button styling
  if (inst.macroBar) {
    const buttons = inst.macroBar.querySelectorAll(".macro-btn");
    for (const btn of buttons) {
      btn.classList.remove("btn-pixel", "btn-bevel", "btn-vector");
      if (chrome.buttonStyle && chrome.buttonStyle !== "default") {
        btn.classList.add(`btn-${chrome.buttonStyle}`);
      }
    }
  }

  // Wrapper accent border
  if (inst.wrapper && chrome.accentColor) {
    inst.wrapper.style.borderColor = chrome.accentColor;
  } else if (inst.wrapper) {
    inst.wrapper.style.borderColor = "";
  }
}

/**
 * Plays a boot sequence — writes lines to the terminal with a delay
 * between each line. Used on terminal creation with a retro theme.
 */
function _playBootSequence(terminal, bootConfig) {
  if (!bootConfig || !bootConfig.lines || bootConfig.lines.length === 0) return;

  const delay = bootConfig.delay || 50; // ms per line — theme-defined
  let i = 0;

  function writeLine() {
    if (i >= bootConfig.lines.length) return;
    terminal.write(bootConfig.lines[i] + "\r\n");
    i++;
    setTimeout(writeLine, delay);
  }

  writeLine();
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
  // Use the app theme's recommended terminal theme as the default for new terminals
  const currentAppTheme = getAppTheme(getCurrentAppTheme());
  const initialTerminalThemeId = currentAppTheme.terminalTheme || "default";
  const defaultTheme = getTheme(initialTerminalThemeId);
  const terminal = new Terminal({
    theme: defaultTheme.xterm,
    fontFamily: defaultTheme.font.family,
    fontSize: defaultTheme.font.size,
    cursorBlink: defaultTheme.cursor.blink,
    cursorStyle: defaultTheme.cursor.style,
    lineHeight: defaultTheme.tuning.lineHeight,
    letterSpacing: defaultTheme.tuning.letterSpacing,
    scrollback: 5000, // lines of scrollback buffer — existing default
  });

  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.loadAddon(new WebLinksAddon());

  // Local File Link Provider
  // xterm.js v6: provideLinks receives (lineNumber, callback)
  // where lineNumber is a 1-based buffer row index.
  terminal.registerLinkProvider({
    provideLinks(lineNumber, callback) {
      const buffer = terminal.buffer.active;
      const bufferLine = buffer.getLine(lineNumber - 1);
      if (!bufferLine) {
        callback([]);
        return;
      }
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
            start: { x: startColumn, y: lineNumber },
            end: { x: endColumn, y: lineNumber },
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

  // Bridge: right-click "Send to Chat" context menu
  surface.addEventListener("contextmenu", (e) => {
    const selection = terminal.getSelection();
    if (!selection) return; // Only show when text is selected

    e.preventDefault();
    e.stopPropagation();

    // Remove any existing context menu
    const old = document.getElementById("bridge-context-menu");
    if (old) old.remove();

    const menu = document.createElement("div");
    menu.id = "bridge-context-menu";
    menu.style.cssText = `
      position: fixed;
      left: ${e.clientX}px;
      top: ${e.clientY}px;
      background: #1f1f31;
      border: 1px solid #2a2a3a;
      border-radius: 6px;
      padding: 4px 0;
      z-index: 10000;
      min-width: 160px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    `;

    const item = document.createElement("button");
    item.style.cssText = `
      display: block; width: 100%; padding: 6px 14px;
      border: none; background: transparent; color: #e0e0e0;
      font-size: 13px; font-family: inherit; text-align: left;
      cursor: pointer;
    `;
    item.textContent = "Send to Chat";
    item.addEventListener("mouseenter", () => {
      item.style.background = "rgba(218, 119, 86, 0.15)";
      item.style.color = "#fff2eb";
    });
    item.addEventListener("mouseleave", () => {
      item.style.background = "transparent";
      item.style.color = "#e0e0e0";
    });
    item.addEventListener("click", () => {
      const text = "```\n" + selection + "\n```";
      window.electronAPI?.sendSnapshotToChat(id, text, null);
      menu.remove();
    });
    menu.appendChild(item);
    document.body.appendChild(menu);

    // Close menu on click outside or escape
    const closeMenu = () => {
      menu.remove();
      document.removeEventListener("click", closeMenu);
      document.removeEventListener("keydown", onEsc);
    };
    const onEsc = (ev) => {
      if (ev.key === "Escape") closeMenu();
    };
    setTimeout(() => {
      document.addEventListener("click", closeMenu);
      document.addEventListener("keydown", onEsc);
    }, 0);
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
    x: 20 + numInstances * 25, // px; stagger offset per instance — existing layout logic
    y: 20 + numInstances * 25, // px; stagger offset per instance — existing layout logic
    width: 600, // px; default floating width — existing layout logic
    height: 400, // px; default floating height — existing layout logic
    zIndex: highestZ++,
    fitTimeout: null,
    theme: initialTerminalThemeId,
    effectsState: {
      scanline: null,
      glow: null,
      border: null,
    },
    tuning: {
      fontSize: 13, // px; default font size — matches default theme
      lineHeight: 1.2, // xterm default — inherited baseline
      letterSpacing: 0, // xterm default — no extra spacing
      glowIntensity: 50, // 50% default glow — design spec
      scanlineOpacity: 30, // 30% default scanline — design spec
      scanlines: false,
      border: false,
    },
  };

  terminalInstances.set(id, newInstance);

  // Apply the mapped terminal theme (handles effects, chrome, boot, font loading)
  if (initialTerminalThemeId !== "default") {
    applyTheme(id, initialTerminalThemeId);
    // Sync the theme selector dropdown to show the mapped theme
    const themeSelect = macroBar.querySelector("select");
    if (themeSelect) themeSelect.value = initialTerminalThemeId;
  }

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
  window.electronAPI?.onBridgeTrace?.((trace) => {
    console.log("[bridge-trace]", trace);
  });

  // Bridge: handle agent identity suggestions from auto-detection
  window.electronAPI?.onIdentitySuggested(
    ({ terminalId, agentName, terminalName }) => {
      // Auto-select the agent in the dropdown
      const inst = terminalInstances.get(terminalId);
      if (!inst) return;
      const select = inst.macroBar?.querySelector(
        `select[data-terminal-id="${terminalId}"]`,
      );
      if (select) select.value = agentName;

      // Show a brief toast notification
      const toast = document.createElement("div");
      toast.style.cssText = `
      position: fixed; bottom: 20px; right: 20px; z-index: 10000;
      background: #1f1f31; border: 1px solid #4ade80; border-radius: 8px;
      padding: 10px 16px; color: #e0e0e0; font-size: 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4); display: flex; gap: 12px;
      align-items: center;
    `;
      toast.innerHTML = `
      <span>Detected <strong style="color: #4ade80">${agentName}</strong> in ${terminalName || "terminal"}</span>
      <button style="padding: 3px 8px; border: 1px solid #4ade80; border-radius: 4px; background: transparent; color: #4ade80; cursor: pointer; font-size: 11px;" onclick="window.electronAPI?.setTerminalIdentity('${terminalId}', '${agentName}', undefined); this.parentElement.remove();">Accept</button>
      <button style="padding: 3px 8px; border: 1px solid #666; border-radius: 4px; background: transparent; color: #888; cursor: pointer; font-size: 11px;" onclick="this.parentElement.remove();">Dismiss</button>
    `;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 10000);
    },
  );

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
  applyTheme: applyTheme,
  toggleLayout: toggleLayout,
};
