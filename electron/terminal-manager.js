"use strict";

const os = require("os");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const pty = require("node-pty");

// ---------------------------------------------------------------------------
// Constants (CASK ordering)
// ---------------------------------------------------------------------------

// Default terminal dimensions — matches a reasonable terminal window.
// Source: user instruction (spec design doc).
const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 30;

// Common shell locations on Windows.
// Source: default install paths for each shell on Windows 11.
const SHELL_CANDIDATES = [
  {
    id: "pwsh",
    name: "PowerShell 7",
    paths: [
      "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
      path.join(
        os.homedir(),
        "AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe",
      ),
    ],
  },
  {
    id: "powershell",
    name: "PowerShell 5",
    paths: ["C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"],
  },
  {
    id: "cmd",
    name: "Command Prompt",
    paths: ["C:\\Windows\\System32\\cmd.exe"],
  },
  {
    id: "bash",
    name: "Git Bash",
    paths: [
      "C:\\Program Files\\Git\\bin\\bash.exe",
      "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
    ],
  },
  {
    id: "wsl",
    name: "WSL",
    paths: ["C:\\Windows\\System32\\wsl.exe"],
  },
];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const terminals = new Map(); // id -> { pty, shell, name, pid, startedAt }
const shellCounters = new Map(); // shell id -> next number
let mainWindow = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isWindowAvailable(win) {
  if (!win) return false;
  if (typeof win.isDestroyed === "function" && win.isDestroyed()) return false;
  if (!win.webContents) return false;
  if (
    typeof win.webContents.isDestroyed === "function" &&
    win.webContents.isDestroyed()
  )
    return false;
  return true;
}

function sendToRenderer(channel, data) {
  if (isWindowAvailable(mainWindow)) {
    mainWindow.webContents.send(channel, data);
  }
}

function detectShells() {
  const available = [];

  for (const candidate of SHELL_CANDIDATES) {
    const foundPath = candidate.paths.find((p) => {
      try {
        return fs.existsSync(p);
      } catch {
        return false;
      }
    });

    if (foundPath) {
      available.push({
        id: candidate.id,
        name: candidate.name,
        path: foundPath,
      });
    }
  }

  return available;
}

function getNextName(shellId) {
  const count = (shellCounters.get(shellId) ?? 0) + 1;
  shellCounters.set(shellId, count);
  return `${shellId} ${count}`;
}

// ---------------------------------------------------------------------------
// Terminal lifecycle
// ---------------------------------------------------------------------------

function createTerminal(opts = {}) {
  const shells = detectShells();
  let shellPath;
  let shellId = opts.shell;

  if (opts.command) {
    // If a specific command is given, we find the default shell to run it in.
    const defaultShell = shells.find(s => s.id === 'pwsh') || shells.find(s => s.id === 'bash') || shells[0];
    shellPath = defaultShell.path;
    shellId = defaultShell.id;
  } else {
    // Otherwise, use the specified shell or the default.
    shellId = shellId || "pwsh";
    const shellInfo = shells.find((s) => s.id === shellId) || shells[0];
    if (!shellInfo) {
      return { error: "No shells available" };
    }
    shellPath = shellInfo.path;
  }
  
  const id = randomUUID();
  const name = opts.name || getNextName(shellId);
  const cwd = opts.cwd || process.cwd();

  const ptyProcess = pty.spawn(shellPath, [], {
    name: "xterm-256color",
    cols: DEFAULT_COLS,
    rows: DEFAULT_ROWS,
    cwd,
    env: process.env,
  });
  
  // If a command was specified, write it to the terminal.
  if (opts.command) {
    ptyProcess.write(`${opts.command}\r`);
  }

  const entry = {
    pty: ptyProcess,
    shell: shellId,
    name,
    pid: ptyProcess.pid,
    startedAt: Date.now(),
  };

  terminals.set(id, entry);

  // Stream stdout to renderer
  ptyProcess.onData((data) => {
    sendToRenderer("terminal:output", { id, data });
  });

  // Notify renderer on exit
  ptyProcess.onExit(({ exitCode }) => {
    sendToRenderer("terminal:exited", { id, exitCode });
  });

  const result = {
    id,
    shell: shellId,
    pid: ptyProcess.pid,
    name,
  };

  sendToRenderer("terminal:created", result);
  return result;
}

function sendInput(id, data) {
  const entry = terminals.get(id);
  if (entry) {
    entry.pty.write(data);
  }
}

function resizeTerminal(id, cols, rows) {
  const entry = terminals.get(id);
  if (entry) {
    entry.pty.resize(
      Math.max(1, Math.floor(cols)),
      Math.max(1, Math.floor(rows)),
    );
  }
}

function closeTerminal(id) {
  const entry = terminals.get(id);
  if (entry) {
    entry.pty.kill();
    terminals.delete(id);
  }
}

function closeAll() {
  for (const [, entry] of terminals) {
    try {
      entry.pty.kill();
    } catch {
      // non-fatal — process may already be dead
    }
  }
  terminals.clear();
}

function getActivePids() {
  const pids = [];
  for (const entry of terminals.values()) {
    if (entry.pid) pids.push(entry.pid);
  }
  return pids;
}

function getEmbeddedTerminalData() {
  const entries = [];
  for (const [id, entry] of terminals) {
    entries.push({
      id,
      pid: entry.pid,
      name: entry.name,
      shell: entry.shell,
      source: "embedded",
      status: "running",
      startedAt: entry.startedAt,
      cwd: null,
      windowTerminalTab: false,
    });
  }
  return entries;
}

function setup(win) {
  mainWindow = win;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  setup,
  detectShells,
  createTerminal,
  sendInput,
  resizeTerminal,
  closeTerminal,
  closeAll,
  getActivePids,
  getEmbeddedTerminalData,
};
