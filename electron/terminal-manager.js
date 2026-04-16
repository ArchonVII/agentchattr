"use strict";

const os = require("os");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const pty = require("node-pty");
const { WatcherEngine } = require("./watcher-engine");

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

const terminals = new Map(); // id -> { pty, shell, name, pid, startedAt, agentName, sessionName }
const shellCounters = new Map(); // shell id -> next number
let mainWindow = null;
let sessionCounter = 0;

// Source: design spec Section 1 — rules path relative to repo root.
const REPO_ROOT = path.resolve(__dirname, "..");
const RULES_PATH = path.join(REPO_ROOT, "data", "watcher-rules.json");
const watcherEngine = new WatcherEngine(RULES_PATH);

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

function emitBridgeTrace(stage, detail = {}) {
  sendToRenderer("terminal:bridge-trace", {
    stage,
    timestamp: Date.now(),
    ...detail,
  });
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
    const defaultShell =
      shells.find((s) => s.id === "pwsh") ||
      shells.find((s) => s.id === "bash") ||
      shells[0];
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
    // Resolve relative script paths against the repo root so that
    // quick-launch buttons work regardless of the terminal's cwd.
    let cmd = opts.command;
    const resolvedPath = path.resolve(REPO_ROOT, cmd);
    if (fs.existsSync(resolvedPath)) {
      cmd = `"${resolvedPath}"`;
    }
    ptyProcess.write(`${cmd}\r`);
  }

  sessionCounter++;
  const entry = {
    pty: ptyProcess,
    shell: shellId,
    name,
    pid: ptyProcess.pid,
    startedAt: Date.now(),
    agentName: opts.agentName || null,
    sessionName: opts.sessionName || `session-${sessionCounter}`,
  };

  terminals.set(id, entry);

  // Stream stdout to renderer — feed watcher engine before forwarding
  ptyProcess.onData((data) => {
    emitBridgeTrace("pty:data", {
      terminalId: id,
      terminalName: entry.name,
      preview: String(data).slice(0, 200),
    });
    watcherEngine.scan(id, data, {
      name: entry.name,
      agentName: entry.agentName,
    });
    sendToRenderer("terminal:output", { id, data });
  });

  // Notify renderer on exit
  ptyProcess.onExit(({ exitCode }) => {
    watcherEngine.removeTerminal(id);
    sendToRenderer("terminal:exited", { id, exitCode });
    postBridgeEvent({
      terminalId: id,
      terminalName: entry.name,
      agentName: entry.agentName,
      sessionName: entry.sessionName,
      ruleId: "terminal-exited",
      category: "system",
      matchedText: `Terminal ${entry.name} exited with code ${exitCode ?? "?"}`,
      contextLines: [],
      timestamp: Date.now(),
    });
  });

  const result = {
    id,
    shell: shellId,
    pid: ptyProcess.pid,
    name,
    cwd,
  };

  sendToRenderer("terminal:created", result);
  const introLines = [
    `Session started: ${name}`,
    `shell: ${shellId}`,
    `session: ${entry.sessionName}`,
    `cwd: ${cwd}`,
    `pid: ${ptyProcess.pid}`,
  ];
  if (entry.agentName) {
    introLines.splice(1, 0, `agent: ${entry.agentName}`);
  }
  postBridgeEvent({
    terminalId: id,
    terminalName: name,
    agentName: entry.agentName,
    sessionName: entry.sessionName,
    ruleId: "terminal-created",
    category: "system",
    matchedText: introLines.join("\n"),
    contextLines: [],
    timestamp: Date.now(),
  });
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
    watcherEngine.removeTerminal(id);
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

// ---------------------------------------------------------------------------
// Bridge: snapshot, identity, watcher config
// ---------------------------------------------------------------------------

function getSnapshot(id, lineCount = 50) {
  return watcherEngine.getSnapshot(id, lineCount);
}

function setTerminalIdentity(id, agentName, sessionName) {
  const entry = terminals.get(id);
  if (!entry) return;
  if (agentName !== undefined) entry.agentName = agentName;
  if (sessionName !== undefined) entry.sessionName = sessionName;
}

function getTerminalIdentity(id) {
  const entry = terminals.get(id);
  if (!entry) return null;
  return { agentName: entry.agentName, sessionName: entry.sessionName };
}

function getWatcherRules() {
  return watcherEngine.getRules();
}

function setWatcherRules(rules) {
  watcherEngine.setRules(rules);
}

/**
 * Returns terminal metadata for the bridge (used by backend proxy).
 */
function getBridgeTerminals() {
  const result = [];
  for (const [id, entry] of terminals) {
    result.push({
      id,
      name: entry.name,
      shell: entry.shell,
      agentName: entry.agentName,
      sessionName: entry.sessionName,
      pid: entry.pid,
    });
  }
  return result;
}

function setup(win) {
  mainWindow = win;

  // Wire the watcher match callback to POST to backend and notify renderer
  watcherEngine.onMatch((event) => {
    // Resolve agent name from terminal entry if not set on the event
    const entry = terminals.get(event.terminalId);
    if (entry) {
      event.terminalName = entry.name;
      event.agentName = event.agentName || entry.agentName;
      event.sessionName = entry.sessionName;
    }

    // Notify renderer for badge updates
    sendToRenderer("terminal:bridge-event", event);
    emitBridgeTrace("watcher:match", {
      terminalId: event.terminalId,
      terminalName: event.terminalName,
      ruleId: event.ruleId,
      category: event.category,
      matchedText: event.matchedText,
    });

    // POST to Python backend (fire-and-forget with one retry)
    postBridgeEvent(event);
  });

  // Wire agent auto-detection callback
  watcherEngine.onIdentityDetected(({ terminalId, agentName }) => {
    const entry = terminals.get(terminalId);
    if (entry && !entry.agentName) {
      // Suggest identity to renderer — user confirms via toast
      sendToRenderer("terminal:identity-suggested", {
        terminalId,
        agentName,
        terminalName: entry.name,
      });
    }
  });

  // Periodically push terminal list + snapshots to the Python backend
  // so the chat UI's "Pull from Terminal" dropdown works.
  // Source: design spec Section 4.3 — Electron pushes data periodically.
  setInterval(() => {
    pushTerminalListToBackend();
  }, 5000);
}

/**
 * POST a bridge event to the Python backend.
 * Fire-and-forget: logs failures but never blocks terminal output.
 * Source: design spec Section 6 — retry once after 1s, then drop.
 */
async function postBridgeEvent(event, retryCount = 0) {
  // Source: main.js SERVER_PORT constant — Python backend port.
  const SERVER_PORT = 8300;
  emitBridgeTrace("bridge:post:start", {
    terminalId: event.terminalId,
    ruleId: event.ruleId,
    retryCount,
    matchedText: event.matchedText,
  });
  try {
    const http = require("http");
    const payload = JSON.stringify(event);
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: SERVER_PORT,
        path: "/api/bridge/event",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
        // Source: design spec — short timeout to avoid blocking.
        timeout: 3000,
      },
      (res) => {
        emitBridgeTrace("bridge:post:response", {
          terminalId: event.terminalId,
          ruleId: event.ruleId,
          statusCode: res.statusCode,
        });
        // Drain the response
        res.resume();
      },
    );
    req.on("error", (err) => {
      emitBridgeTrace("bridge:post:error", {
        terminalId: event.terminalId,
        ruleId: event.ruleId,
        retryCount,
        error: err.message,
      });
      if (retryCount < 1) {
        setTimeout(() => postBridgeEvent(event, retryCount + 1), 1000);
      } else {
        console.warn("Bridge POST failed after retry:", err.message);
      }
    });
    req.write(payload);
    req.end();
  } catch (err) {
    emitBridgeTrace("bridge:post:throw", {
      terminalId: event.terminalId,
      ruleId: event.ruleId,
      error: err.message,
    });
    console.warn("Bridge POST error:", err.message);
  }
}

/**
 * Push terminal list to the Python backend for the chat UI dropdown.
 * Also pushes snapshot data for each terminal.
 */
function pushTerminalListToBackend() {
  const SERVER_PORT = 8300;
  const termList = getBridgeTerminals();
  if (termList.length === 0) return;

  const http = require("http");

  // Push terminal list
  const listPayload = JSON.stringify({ terminals: termList });
  const listReq = http.request(
    {
      hostname: "127.0.0.1",
      port: SERVER_PORT,
      path: "/api/bridge/terminals",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(listPayload),
      },
      timeout: 3000,
    },
    (res) => res.resume(),
  );
  listReq.on("error", () => {}); // silent
  listReq.write(listPayload);
  listReq.end();

  // Push snapshots for each terminal
  for (const t of termList) {
    const lines = watcherEngine.getSnapshot(t.id, 50);
    if (lines.length === 0) continue;

    const snapPayload = JSON.stringify({ terminalId: t.id, lines });
    const snapReq = http.request(
      {
        hostname: "127.0.0.1",
        port: SERVER_PORT,
        path: "/api/bridge/snapshot",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(snapPayload),
        },
        timeout: 3000,
      },
      (res) => res.resume(),
    );
    snapReq.on("error", () => {}); // silent
    snapReq.write(snapPayload);
    snapReq.end();
  }
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
  getSnapshot,
  setTerminalIdentity,
  getTerminalIdentity,
  getWatcherRules,
  setWatcherRules,
  getBridgeTerminals,
};
