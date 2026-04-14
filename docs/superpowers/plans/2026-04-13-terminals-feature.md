# Terminals Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add terminal process scanning and embedded interactive terminals to the agentchattr Electron desktop app, surfaced in the presence panel sidebar and a new Terminals tab.

**Architecture:** Electron-native approach — scanning and pty management in the main process, IPC channels to the renderer, data forwarded to the chat webview for presence panel rendering. Embedded terminals use xterm.js in the renderer with node-pty backends in main. Follows existing port-scanner and browser-pane patterns.

**Tech Stack:** Electron IPC, PowerShell/tasklist for process enumeration, xterm.js + node-pty for embedded terminals, vanilla JS DOM rendering.

**Spec:** `docs/superpowers/specs/2026-04-13-terminals-feature-design.md`

---

## Phase A — External Terminal Scanning and Presence UI

### Task 1: Create the terminal scanner module

**Files:**
- Create: `electron/terminal-scanner.js`

This module detects running terminal processes on Windows. It follows the same `startScanning` / `stopScanning` / polling pattern as `electron/port-scanner.js`.

- [ ] **Step 1: Create `electron/terminal-scanner.js` with constants and exports**

```js
"use strict";

const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

// CASK: Constants
const DEFAULT_INTERVAL_MS = 3000;
const TASKLIST_BUFFER_BYTES = 2 * 1024 * 1024;
const WMI_BUFFER_BYTES = 4 * 1024 * 1024;

// Shell executables to detect — keys are the normalised base names,
// values are the human-friendly label shown in the UI.
// Source: Windows default shells + common third-party terminals.
const SHELL_EXECUTABLES = new Map([
  ["pwsh", "pwsh"],
  ["powershell", "powershell"],
  ["cmd", "cmd"],
  ["bash", "bash"],
  ["wsl", "wsl"],
  ["git-bash", "git-bash"],
]);

// Windows Terminal host process — used for enrichment, not listed directly.
const WT_PROCESS_NAME = "windowsterminal";

// CASK: State
let scanTimer = null;
let scanInFlight = false;
let targetWindow = null;
let excludedPids = new Set(); // PIDs from embedded terminals to skip

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

function normaliseProcessName(name) {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\.exe$/i, "")
    .replace(/[^a-z0-9\-]+/g, "");
}

function parseWmicOutput(stdout) {
  // Parses CSV from PowerShell: "PID","Name","CommandLine","ParentProcessId","CreationDate"
  const results = [];
  const lines = stdout.split(/\r?\n/).filter(Boolean);

  for (const line of lines) {
    const match = line.match(
      /^"(\d+)","((?:[^"]|"")*)","((?:[^"]|"")*)","(\d+)","((?:[^"]|"")*)"$/,
    );
    if (!match) continue;

    const pid = parseInt(match[1], 10);
    const name = match[2].replace(/""/g, '"');
    const commandLine = match[3].replace(/""/g, '"');
    const parentPid = parseInt(match[4], 10);
    const creationDate = match[5].replace(/""/g, '"');

    results.push({ pid, name, commandLine, parentPid, creationDate });
  }

  return results;
}

function shellLabelFromName(processName) {
  const key = normaliseProcessName(processName);
  return SHELL_EXECUTABLES.get(key) ?? null;
}

function parseCreationDate(wmicDate) {
  // WMI CreationDate format: "20260413143022.123456+060"
  // Or ISO string from PowerShell
  if (!wmicDate) return Date.now();
  try {
    const d = new Date(wmicDate);
    if (!isNaN(d.getTime())) return d.getTime();
  } catch {
    // fall through
  }
  // Try WMI format: YYYYMMDDHHmmss
  const m = wmicDate.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (m) {
    return new Date(
      parseInt(m[1]),
      parseInt(m[2]) - 1,
      parseInt(m[3]),
      parseInt(m[4]),
      parseInt(m[5]),
      parseInt(m[6]),
    ).getTime();
  }
  return Date.now();
}

function deriveWindowTitle(commandLine, processName) {
  // Attempt to extract a meaningful name from the command line
  // e.g. "pwsh -NoExit -Command cd C:\AI\JAgentchattr" -> "JAgentchattr"
  if (!commandLine) return processName;

  // Check for working directory patterns
  const cdMatch = commandLine.match(/(?:cd|Set-Location|pushd)\s+["']?([^\s"']+)/i);
  if (cdMatch) {
    const parts = cdMatch[1].replace(/\\/g, "/").split("/");
    return parts[parts.length - 1] || processName;
  }

  return processName;
}

async function scanTerminalProcesses() {
  // Query all running processes, then filter to shell executables.
  // Uses PowerShell + Get-CimInstance for rich metadata.
  const shellFilter = Array.from(SHELL_EXECUTABLES.keys())
    .map((name) => `Name LIKE '${name}.exe'`)
    .join(" OR ");

  // Also grab wt.exe (WindowsTerminal) for parent-process enrichment
  const fullFilter = `(${shellFilter} OR Name LIKE 'WindowsTerminal.exe')`;

  const psCommand = `Get-CimInstance Win32_Process -Filter "${fullFilter}" | Select-Object ProcessId,Name,CommandLine,ParentProcessId,CreationDate | ForEach-Object { '"' + $_.ProcessId + '","' + ($_.Name -replace '"','""') + '","' + ($_.CommandLine -replace '"','""') + '","' + $_.ParentProcessId + '","' + $_.CreationDate + '"' }`;

  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NoLogo", "-Command", psCommand],
    { maxBuffer: WMI_BUFFER_BYTES, windowsHide: true, timeout: 8000 },
  );

  return parseWmicOutput(stdout);
}

function buildTerminalEntries(rawProcesses) {
  // Separate Windows Terminal host processes for enrichment
  const wtPids = new Set();
  for (const proc of rawProcesses) {
    if (normaliseProcessName(proc.name) === WT_PROCESS_NAME) {
      wtPids.add(proc.pid);
    }
  }

  const entries = [];

  for (const proc of rawProcesses) {
    const normName = normaliseProcessName(proc.name);

    // Skip the Windows Terminal host process itself — it's not a shell
    if (normName === WT_PROCESS_NAME) continue;

    // Skip if this PID belongs to an embedded terminal
    if (excludedPids.has(proc.pid)) continue;

    const shell = shellLabelFromName(proc.name);
    if (!shell) continue;

    const isWtTab = wtPids.has(proc.parentPid);

    entries.push({
      id: `ext-${proc.pid}`,
      pid: proc.pid,
      name: deriveWindowTitle(proc.commandLine, shell),
      shell,
      source: "external",
      status: "running",
      startedAt: parseCreationDate(proc.creationDate),
      cwd: null, // CWD detection is unreliable on Windows; omit for now
      windowTerminalTab: isWtTab,
    });
  }

  // Sort: most recently started first
  entries.sort((a, b) => b.startedAt - a.startedAt);

  return entries;
}

async function performScanCycle() {
  if (scanInFlight) return;
  scanInFlight = true;

  try {
    const rawProcesses = await scanTerminalProcesses();
    const entries = buildTerminalEntries(rawProcesses);

    if (isWindowAvailable(targetWindow)) {
      targetWindow.webContents.send("terminal-data", entries);
    }
  } catch (error) {
    console.error("Terminal scanning cycle failed:", error);
  } finally {
    scanInFlight = false;
  }
}

function startScanning(mainWindow, intervalMs = DEFAULT_INTERVAL_MS) {
  stopScanning();
  targetWindow = mainWindow ?? null;

  const safeInterval =
    Number.isFinite(intervalMs) && intervalMs > 0
      ? intervalMs
      : DEFAULT_INTERVAL_MS;

  void performScanCycle();
  scanTimer = setInterval(() => void performScanCycle(), safeInterval);
}

function stopScanning() {
  if (scanTimer) {
    clearInterval(scanTimer);
    scanTimer = null;
  }
  targetWindow = null;
}

function setExcludedPids(pids) {
  excludedPids = new Set(pids);
}

module.exports = {
  startScanning,
  stopScanning,
  setExcludedPids,
  // Exported for testing:
  normaliseProcessName,
  parseWmicOutput,
  shellLabelFromName,
  buildTerminalEntries,
  parseCreationDate,
};
```

- [ ] **Step 2: Verify the module loads without errors**

Run: `cd electron && node -e "const ts = require('./terminal-scanner'); console.log('OK', Object.keys(ts))"`

Expected: `OK [ 'startScanning', 'stopScanning', 'setExcludedPids', 'normaliseProcessName', 'parseWmicOutput', 'shellLabelFromName', 'buildTerminalEntries', 'parseCreationDate' ]`

- [ ] **Step 3: Commit**

```bash
git add electron/terminal-scanner.js
git commit -m "feat(terminals): add terminal process scanner module"
```

---

### Task 2: Wire the scanner into the Electron main process and preload

**Files:**
- Modify: `electron/main.js:257-276` (wireModules function)
- Modify: `electron/main.js:308-315` (before-quit handler)
- Modify: `electron/preload.js:3-38`

- [ ] **Step 1: Add terminal scanner to `wireModules()` in `electron/main.js`**

After the port scanner block (line ~276), add:

```js
  // Terminal scanner
  const { startScanning: startTerminalScanning } = require("./terminal-scanner");
  startTerminalScanning(mainWindow);
```

- [ ] **Step 2: Add terminal scanner cleanup to `before-quit` handler in `electron/main.js`**

After the port scanner `stopScanning()` call (line ~311), add:

```js
  const { stopScanning: stopTerminalScanning } = require("./terminal-scanner");
  stopTerminalScanning();
```

- [ ] **Step 3: Add `onTerminalData` to `electron/preload.js`**

Inside the `contextBridge.exposeInMainWorld("electronAPI", { ... })` block, add after the `onPortData` method:

```js
  onTerminalData(callback) {
    ipcRenderer.on("terminal-data", (_event, data) => callback(data));
  },
```

- [ ] **Step 4: Verify the app still starts**

Run: `cd electron && npm start`

Expected: App launches, no console errors related to terminal-scanner. The scanner polls silently in the background.

- [ ] **Step 5: Commit**

```bash
git add electron/main.js electron/preload.js
git commit -m "feat(terminals): wire scanner into main process and preload"
```

---

### Task 3: Create the terminal presence data bridge

**Files:**
- Create: `electron/renderer/terminal-presence.js`

This module runs in the Electron renderer. It receives terminal data via IPC and forwards it to the chat webview so the presence panel can render terminal items.

- [x] **Step 1: Create `electron/renderer/terminal-presence.js`**

```js
"use strict";

// Terminal presence bridge — forwards terminal data from the Electron
// renderer to the chat webview so the presence panel can render it.

const TERMINAL_COLLAPSE_KEY = "agentchattr-terminal-collapsed";

function initTerminalPresence(chatWebview, electronAPI) {
  if (!electronAPI?.onTerminalData) return;

  electronAPI.onTerminalData((terminals) => {
    if (!chatWebview) return;

    // Inject the terminal data into the webview's global scope.
    // The chat.js renderChannelRoster() reads window._terminalData.
    const script = `
      (() => {
        try {
          window._terminalData = ${JSON.stringify(terminals)};
          if (typeof window.renderChannelRoster === 'function') {
            window.renderChannelRoster();
          }
        } catch (e) {
          console.warn('Terminal presence injection failed:', e);
        }
      })();
    `;

    try {
      chatWebview.executeJavaScript(script, true);
    } catch {
      // Webview may not be ready yet — non-fatal
    }
  });
}

window.TerminalPresence = { init: initTerminalPresence };
```

- [x] **Step 2: Add the script tag to `electron/renderer/index.html`**

Before the `renderer.js` script tag (line ~661), add:

```html
    <script src="./terminal-presence.js"></script>
```

- [x] **Step 3: Initialise the bridge in `electron/renderer/renderer.js`**

Inside `bindEvents()`, after the `chatWebview.addEventListener("dom-ready", ...)` block (line ~799), add:

```js
  // Terminal presence — forward terminal scan data to the chat webview
  window.TerminalPresence.init(elements.chatWebview, window.electronAPI);
```

- [x] **Step 4: Commit**

```bash
git add electron/renderer/terminal-presence.js electron/renderer/index.html electron/renderer/renderer.js
git commit -m "feat(terminals): add presence data bridge from renderer to webview"
```

---

### Task 4: Render terminal items in the presence panel

**Files:**
- Modify: `static/chat.js:1528-1573` (renderChannelRoster function)

This adds a "Terminals" section below the existing participant roster.

- [ ] **Step 1: Add the terminal section rendering to `renderChannelRoster()` in `static/chat.js`**

After the existing participant rendering loop (after line ~1572, before the closing `}` of `renderChannelRoster`), add:

```js
  // --- Terminal sessions section ---
  const terminalData = window._terminalData;
  if (Array.isArray(terminalData) && terminalData.length > 0) {
    const COLLAPSE_KEY = "agentchattr-terminal-collapsed";
    const collapsed = localStorage.getItem(COLLAPSE_KEY) === "1";

    const section = document.createElement("div");
    section.className = "presence-terminal-section";

    const header = document.createElement("button");
    header.type = "button";
    header.className = "presence-terminal-header";
    header.onclick = () => {
      const next = localStorage.getItem(COLLAPSE_KEY) !== "1";
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      renderChannelRoster();
    };

    const caret = document.createElement("span");
    caret.className = "presence-terminal-caret";
    caret.textContent = collapsed ? "\u25b8" : "\u25be";
    header.appendChild(caret);

    const headerLabel = document.createElement("span");
    headerLabel.textContent = "Terminals";
    header.appendChild(headerLabel);

    const badge = document.createElement("span");
    badge.className = "presence-terminal-badge";
    badge.textContent = String(terminalData.length);
    header.appendChild(badge);

    section.appendChild(header);

    if (!collapsed) {
      // Sort: embedded first, then external; within each group by most recent
      const sorted = [...terminalData].sort((a, b) => {
        if (a.source !== b.source) {
          return a.source === "embedded" ? -1 : 1;
        }
        return (b.startedAt || 0) - (a.startedAt || 0);
      });

      for (const term of sorted) {
        const item = document.createElement("div");
        item.className = "presence-item presence-terminal-item";
        if (term.source === "embedded") item.classList.add("embedded");
        if (term.status === "running") item.classList.add("available");

        const age = _formatTerminalAge(term.startedAt);
        const prefix = term.source === "embedded" ? "\u25b6 " : "";
        const pidLabel = term.pid ? `PID ${term.pid}` : "";
        const metaParts = [pidLabel, age].filter(Boolean).join(" \u00b7 ");

        item.innerHTML = `
          <div class="presence-avatar-wrap">
            <div class="presence-avatar presence-terminal-avatar">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" stroke-width="1.2"/>
                <path d="M4.5 6l2.5 2-2.5 2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                <line x1="8.5" y1="10" x2="11" y2="10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
              </svg>
            </div>
            <span class="presence-state-dot"></span>
          </div>
          <div class="presence-body">
            <div class="presence-name-row">
              <span class="presence-name">${escapeHtml(prefix + term.name)}</span>
              <span class="presence-role">${escapeHtml(term.shell)}</span>
            </div>
            <div class="presence-meta">${escapeHtml(metaParts)}</div>
          </div>`;

        if (term.source === "embedded" && term.id) {
          item.style.cursor = "pointer";
          item.title = "Focus in Terminals tab";
          item.addEventListener("click", () => {
            if (window._focusEmbeddedTerminal) {
              window._focusEmbeddedTerminal(term.id);
            }
          });
        }

        section.appendChild(item);
      }
    }

    list.appendChild(section);
  }
```

- [ ] **Step 2: Add the `_formatTerminalAge` helper before `renderChannelRoster()`**

Insert before the `renderChannelRoster` function:

```js
function _formatTerminalAge(timestamp) {
  if (!timestamp) return "";
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
```

- [ ] **Step 3: Verify the presence panel still renders correctly with no terminal data**

Run: `cd electron && npm start`

Expected: Presence panel shows participants as before. No "Terminals" section appears (since `window._terminalData` is undefined).

- [ ] **Step 4: Commit**

```bash
git add static/chat.js
git commit -m "feat(terminals): render terminal items in presence panel"
```

---

### Task 5: Add CSS styles for the terminal presence section

**Files:**
- Modify: `static/style.css` (append after presence panel styles, around line ~1040)

- [ ] **Step 1: Add terminal presence styles to `static/style.css`**

Insert after the `.presence-item.offline` rule (around line 1027):

```css
/* --- Terminal presence section --- */

.presence-terminal-section {
    margin-top: 6px;
    padding-top: 8px;
    border-top: 1px solid var(--border-subtle);
}

.presence-terminal-header {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 6px 10px;
    border: none;
    border-radius: var(--radius-lg);
    background: transparent;
    color: var(--text-dim);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    cursor: pointer;
    font-family: inherit;
}

.presence-terminal-header:hover {
    background: var(--white-04);
    color: var(--text);
}

.presence-terminal-caret {
    font-size: 10px;
    line-height: 1;
    width: 10px;
    text-align: center;
}

.presence-terminal-badge {
    margin-left: auto;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-full);
    background: var(--white-06);
    color: var(--text-dim);
    font-size: 10px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
}

.presence-terminal-item {
    border-color: rgba(120, 180, 220, 0.15);
}

.presence-terminal-item.embedded {
    border-color: rgba(218, 119, 86, 0.22);
}

.presence-terminal-item.available .presence-state-dot {
    background: var(--green, #4ade80);
}

.presence-terminal-avatar {
    width: 34px;
    height: 34px;
    border-radius: 11px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(120, 180, 220, 0.15);
    color: #78b4dc;
}

.presence-terminal-item.embedded .presence-terminal-avatar {
    background: rgba(218, 119, 86, 0.15);
    color: #da7756;
}
```

- [ ] **Step 2: Verify styles render correctly**

Run: `cd electron && npm start`

Expected: When terminal processes are detected, the "Terminals" section appears below the participant list with properly styled items, status dots, and collapse/expand behaviour.

- [ ] **Step 3: Commit**

```bash
git add static/style.css
git commit -m "style(terminals): add presence panel terminal section styles"
```

---

### Task 6: Smoke test Phase A end-to-end

**Files:** None (manual verification)

- [ ] **Step 1: Start the Electron app**

Run: `cd electron && npm start`

- [ ] **Step 2: Verify external terminals appear**

Open a separate PowerShell window. Within ~3 seconds, the "Terminals" section should appear in the presence panel sidebar, showing the `pwsh` process.

- [ ] **Step 3: Verify collapse/expand**

Click the "Terminals" section header. It should collapse. Click again to expand. Restart the app — the collapsed state should persist.

- [ ] **Step 4: Verify count updates**

Open a second terminal window (e.g. `cmd`). The badge count should increment. Close it — the count should decrement on the next scan cycle.

- [ ] **Step 5: Commit a checkpoint**

```bash
git commit --allow-empty -m "chore(terminals): Phase A smoke tested and verified"
```

---

## Phase B — Embedded Terminals

### Task 7: Install xterm and node-pty dependencies

**Files:**
- Modify: `electron/package.json`

- [ ] **Step 1: Install npm packages**

Run:
```bash
cd electron && npm install xterm @xterm/addon-fit @xterm/addon-web-links node-pty
```

Expected: All four packages install successfully. `node-pty` may trigger a native build step — this requires Python and a C++ compiler (Visual Studio Build Tools), which should already be available on this machine.

- [ ] **Step 2: Verify node-pty loads**

Run: `cd electron && node -e "const pty = require('node-pty'); console.log('node-pty OK')"`

Expected: `node-pty OK`

- [ ] **Step 3: Commit**

```bash
git add electron/package.json electron/package-lock.json
git commit -m "build(terminals): add xterm and node-pty dependencies"
```

---

### Task 8: Create the terminal manager module

**Files:**
- Create: `electron/terminal-manager.js`

Manages node-pty instances, shell detection, and IPC handling for embedded terminals.

- [ ] **Step 1: Create `electron/terminal-manager.js`**

```js
"use strict";

const os = require("os");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const pty = require("node-pty");

// CASK: Constants
const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 30;

// Common shell locations on Windows.
// Source: default install paths for each shell.
const SHELL_CANDIDATES = [
  {
    id: "pwsh",
    name: "PowerShell 7",
    paths: [
      "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
      path.join(os.homedir(), "AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe"),
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

// CASK: State
const terminals = new Map(); // id -> { pty, shell, name, pid, startedAt }
const shellCounters = new Map(); // shell id -> next number
let mainWindow = null;

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

function createTerminal(opts = {}) {
  const shells = detectShells();
  const shellId = opts.shell || "pwsh";
  const shellInfo = shells.find((s) => s.id === shellId) || shells[0];

  if (!shellInfo) {
    return { error: "No shells available" };
  }

  const id = randomUUID();
  const name = opts.name || getNextName(shellInfo.id);
  const cwd = opts.cwd || process.cwd();

  const ptyProcess = pty.spawn(shellInfo.path, [], {
    name: "xterm-256color",
    cols: DEFAULT_COLS,
    rows: DEFAULT_ROWS,
    cwd,
    env: process.env,
  });

  const entry = {
    pty: ptyProcess,
    shell: shellInfo.id,
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
    shell: shellInfo.id,
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
  for (const [id, entry] of terminals) {
    try {
      entry.pty.kill();
    } catch {
      // non-fatal
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
```

- [ ] **Step 2: Verify the module loads**

Run: `cd electron && node -e "const tm = require('./terminal-manager'); console.log('shells:', tm.detectShells().map(s => s.id))"`

Expected: Lists available shells, e.g. `shells: [ 'pwsh', 'powershell', 'cmd', 'bash' ]`

- [ ] **Step 3: Commit**

```bash
git add electron/terminal-manager.js
git commit -m "feat(terminals): add terminal manager with pty lifecycle"
```

---

### Task 9: Wire terminal manager IPC into main.js and preload.js

**Files:**
- Modify: `electron/main.js:41-68` (registerIpcHandlers function)
- Modify: `electron/main.js:257-286` (wireModules function)
- Modify: `electron/main.js:308-315` (before-quit handler)
- Modify: `electron/preload.js`

- [ ] **Step 1: Add terminal IPC handlers to `registerIpcHandlers()` in `electron/main.js`**

After the existing `ipcMain.handle("open-browser-url", ...)` block, add:

```js
  // Terminal manager IPC
  ipcMain.handle("terminal:create", (_event, opts) => {
    const tm = require("./terminal-manager");
    return tm.createTerminal(opts);
  });

  ipcMain.on("terminal:input", (_event, { id, data }) => {
    const tm = require("./terminal-manager");
    tm.sendInput(id, data);
  });

  ipcMain.on("terminal:resize", (_event, { id, cols, rows }) => {
    const tm = require("./terminal-manager");
    tm.resizeTerminal(id, cols, rows);
  });

  ipcMain.on("terminal:close", (_event, { id }) => {
    const tm = require("./terminal-manager");
    tm.closeTerminal(id);
  });

  ipcMain.handle("terminal:list-shells", () => {
    const tm = require("./terminal-manager");
    return tm.detectShells();
  });
```

- [ ] **Step 2: Wire terminal manager setup and scanner deduplication into `wireModules()`**

After the terminal scanner block added in Task 2, add:

```js
  // Terminal manager (embedded terminals)
  const terminalManager = require("./terminal-manager");
  terminalManager.setup(mainWindow);

  // Deduplication: share embedded PIDs with the scanner
  const { setExcludedPids } = require("./terminal-scanner");
  setInterval(() => {
    setExcludedPids(terminalManager.getActivePids());
  }, 1000);
```

- [ ] **Step 3: Add terminal manager cleanup to `before-quit` handler**

After the terminal scanner cleanup added in Task 2, add:

```js
  const terminalManager = require("./terminal-manager");
  terminalManager.closeAll();
```

- [ ] **Step 4: Add terminal IPC methods to `electron/preload.js`**

Add these methods inside the `contextBridge.exposeInMainWorld("electronAPI", { ... })` block:

```js
  // Terminal manager (Phase B — embedded terminals)
  createTerminal(opts) {
    return ipcRenderer.invoke("terminal:create", opts);
  },
  sendTerminalInput(id, data) {
    ipcRenderer.send("terminal:input", { id, data });
  },
  resizeTerminal(id, cols, rows) {
    ipcRenderer.send("terminal:resize", { id, cols, rows });
  },
  closeTerminal(id) {
    ipcRenderer.send("terminal:close", { id });
  },
  listShells() {
    return ipcRenderer.invoke("terminal:list-shells");
  },
  onTerminalOutput(callback) {
    ipcRenderer.on("terminal:output", (_event, data) => callback(data));
  },
  onTerminalCreated(callback) {
    ipcRenderer.on("terminal:created", (_event, data) => callback(data));
  },
  onTerminalExited(callback) {
    ipcRenderer.on("terminal:exited", (_event, data) => callback(data));
  },
```

- [ ] **Step 5: Verify the app starts with all IPC handlers registered**

Run: `cd electron && npm start`

Expected: App launches. No errors about duplicate IPC handler names or missing modules.

- [ ] **Step 6: Commit**

```bash
git add electron/main.js electron/preload.js
git commit -m "feat(terminals): wire terminal manager IPC and preload API"
```

---

### Task 10: Add the Terminals tab to the Electron renderer HTML and tab switching

**Files:**
- Modify: `electron/renderer/index.html:563-604` (tab bar), `electron/renderer/index.html:606-658` (content area)
- Modify: `electron/renderer/renderer.js`

- [ ] **Step 1: Add the Terminals tab button to the tab bar in `index.html`**

After the Ports tab-item `</div>` (line ~603), add:

```html
        <div class="tab-item">
          <button
            type="button"
            class="tab-button"
            data-tab="terminals"
            role="tab"
            aria-selected="false"
          >
            Terminals
          </button>
          <button
            type="button"
            class="pop-out-button"
            data-popout="terminals"
            aria-label="Pop out Terminals"
            title="Pop out Terminals"
          >
            &#8599;
          </button>
        </div>
```

- [ ] **Step 2: Add the Terminals container to the content area in `index.html`**

After the `#ports-container` div (line ~657), add:

```html
        <div id="terminals-container" hidden></div>
```

- [ ] **Step 3: Add the xterm.js CSS link to the `<head>` in `index.html`**

After the existing `<style>` block's closing tag, add:

```html
    <link rel="stylesheet" href="../node_modules/xterm/css/xterm.css" />
```

- [ ] **Step 4: Add the `terminals.js` script tag to `index.html`**

After the `terminal-presence.js` script tag (added in Task 3), add:

```html
    <script src="./terminals.js"></script>
```

- [ ] **Step 5: Add terminals container styles to `index.html`'s `<style>` block**

After the `#ports-container[hidden]` rule, add:

```css
      #terminals-container {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        background: #12121e;
      }

      #terminals-container[hidden] {
        display: none;
      }

      .terminals-tab-strip {
        display: flex;
        align-items: stretch;
        height: 32px;
        background: #1a1a2e;
        border-bottom: 1px solid #2a2a3a;
        padding: 0 8px;
        gap: 2px;
        flex-shrink: 0;
        overflow-x: auto;
      }

      .terminal-tab {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 0 12px;
        background: transparent;
        border: none;
        color: #888;
        font-size: 12px;
        font-family: inherit;
        cursor: pointer;
        border-bottom: 2px solid transparent;
        white-space: nowrap;
      }

      .terminal-tab.active {
        color: #da7756;
        border-bottom-color: #da7756;
      }

      .terminal-tab:hover:not(.active) {
        color: #b4b4c3;
      }

      .terminal-tab-close {
        width: 16px;
        height: 16px;
        padding: 0;
        border: none;
        border-radius: 3px;
        background: transparent;
        color: #666;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        line-height: 1;
        opacity: 0;
      }

      .terminal-tab:hover .terminal-tab-close,
      .terminal-tab.active .terminal-tab-close {
        opacity: 1;
      }

      .terminal-tab-close:hover {
        background: rgba(255, 100, 100, 0.2);
        color: #ffb5b5;
      }

      .terminal-tab-add {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        background: transparent;
        border: none;
        color: #666;
        font-size: 18px;
        cursor: pointer;
        flex-shrink: 0;
      }

      .terminal-tab-add:hover {
        color: #da7756;
      }

      .terminal-shell-menu {
        position: absolute;
        top: 32px;
        background: #1f1f31;
        border: 1px solid #2a2a3a;
        border-radius: 6px;
        padding: 4px 0;
        z-index: 100;
        min-width: 160px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
      }

      .terminal-shell-option {
        display: block;
        width: 100%;
        padding: 6px 14px;
        border: none;
        background: transparent;
        color: #e0e0e0;
        font-size: 13px;
        font-family: inherit;
        text-align: left;
        cursor: pointer;
      }

      .terminal-shell-option:hover {
        background: rgba(218, 119, 86, 0.15);
        color: #fff2eb;
      }

      .terminal-surface {
        flex: 1;
        min-height: 0;
        position: relative;
      }

      .terminal-surface .xterm {
        height: 100%;
        padding: 4px;
      }

      .terminal-empty {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: #666;
        font-size: 14px;
      }

      .terminal-exited-banner {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        padding: 8px 16px;
        background: #1a1a2e;
        border-top: 1px solid #2a2a3a;
        color: #888;
        font-size: 12px;
        flex-shrink: 0;
      }

      .terminal-exited-banner button {
        padding: 4px 10px;
        border: 1px solid #2a2a3a;
        border-radius: 4px;
        background: #1f1f31;
        color: #e0e0e0;
        font-size: 12px;
        cursor: pointer;
        font-family: inherit;
      }

      .terminal-exited-banner button:hover {
        border-color: #da7756;
      }
```

- [ ] **Step 6: Update `activateTab()` in `renderer.js` to handle the terminals tab**

In `renderer.js`, modify the `activateTab` function to also toggle the terminals container:

```js
  elements.chatShell.hidden = tabName !== "chat";
  elements.portsContainer.hidden = tabName !== "ports";
  elements.terminalsContainer.hidden = tabName !== "terminals";
```

- [ ] **Step 7: Add `terminalsContainer` to the `elements` object in `renderer.js`**

After the `portsContainer` line:

```js
  terminalsContainer: document.getElementById("terminals-container"),
```

- [ ] **Step 8: Verify the tab appears and switches correctly**

Run: `cd electron && npm start`

Expected: Three tabs visible — Chat, Ports, Terminals. Clicking Terminals shows an empty container. Clicking Chat returns to the chat view.

- [ ] **Step 9: Commit**

```bash
git add electron/renderer/index.html electron/renderer/renderer.js
git commit -m "feat(terminals): add Terminals tab to Electron renderer"
```

---

### Task 11: Create the terminals renderer module (xterm.js tab strip and terminal surface)

**Files:**
- Create: `electron/renderer/terminals.js`

This is the largest task — the full embedded terminal UI with tab strip, xterm.js instances, shell picker, and lifecycle management.

- [ ] **Step 1: Create `electron/renderer/terminals.js`**

```js
"use strict";

// Terminals renderer — manages xterm.js instances, tab strip, and
// shell picker in the Electron renderer's Terminals tab.

const { Terminal } = require("xterm");
const { FitAddon } = require("@xterm/addon-fit");
const { WebLinksAddon } = require("@xterm/addon-web-links");

// CASK: Constants
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

// CASK: State
const terminalInstances = new Map(); // id -> { terminal, fitAddon, container }
let activeTerminalId = null;
let availableShells = [];
let shellMenuOpen = false;

function getContainer() {
  return document.getElementById("terminals-container");
}

function renderTabStrip() {
  const container = getContainer();
  if (!container) return;

  // Remove existing tab strip
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

  // Add [+] button
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

  container.prepend(strip);
}

function toggleShellMenu(anchor) {
  const container = getContainer();
  const existing = container.querySelector(".terminal-shell-menu");
  if (existing) {
    existing.remove();
    shellMenuOpen = false;
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
        shellMenuOpen = false;
        void requestNewTerminal(shell.id);
      });
      menu.appendChild(btn);
    }
  }

  // Position relative to anchor
  const rect = anchor.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  menu.style.left = (rect.left - containerRect.left) + "px";

  container.appendChild(menu);
  shellMenuOpen = true;

  // Close on outside click
  const closeMenu = (e) => {
    if (!menu.contains(e.target) && e.target !== anchor) {
      menu.remove();
      shellMenuOpen = false;
      document.removeEventListener("click", closeMenu);
    }
  };
  setTimeout(() => document.addEventListener("click", closeMenu), 0);
}

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

function createXtermInstance(id, name, shell) {
  const terminal = new Terminal({
    theme: XTERM_THEME,
    fontFamily: 'Consolas, "Courier New", monospace',
    fontSize: 14,
    cursorBlink: true,
    cursorStyle: "bar",
    allowProposedApi: true,
  });

  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.loadAddon(new WebLinksAddon());

  const surface = document.createElement("div");
  surface.className = "terminal-surface";
  surface.dataset.terminalId = id;
  surface.style.display = "none";

  const container = getContainer();
  container.appendChild(surface);

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
    surface,
    name: name || shell || id.slice(0, 8),
    shell,
    exited: false,
  });

  renderTabStrip();
}

function focusTerminal(id) {
  if (!terminalInstances.has(id)) return;

  activeTerminalId = id;

  for (const [tid, inst] of terminalInstances) {
    inst.surface.style.display = tid === id ? "" : "none";
  }

  const active = terminalInstances.get(id);
  if (active) {
    active.fitAddon.fit();
    active.terminal.focus();
  }

  // Update exited banner visibility
  renderExitedBanner();
  renderTabStrip();
}

function destroyTerminal(id) {
  const inst = terminalInstances.get(id);
  if (!inst) return;

  window.electronAPI?.closeTerminal(id);
  inst.terminal.dispose();
  inst.surface.remove();
  terminalInstances.delete(id);

  if (activeTerminalId === id) {
    const remaining = [...terminalInstances.keys()];
    activeTerminalId = remaining.length > 0 ? remaining[remaining.length - 1] : null;

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

  const active = activeTerminalId ? terminalInstances.get(activeTerminalId) : null;

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
    inst.terminal.write(`\r\n\x1b[90m[Process exited with code ${exitCode ?? "?"}]\x1b[0m\r\n`);

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
  const observer = new ResizeObserver(() => handleResize());
  const container = getContainer();
  if (container) observer.observe(container);

  renderTabStrip();
  renderEmptyState();
}

// Global hook for presence panel click-through (Phase B integration)
window._focusEmbeddedTerminal = (id) => {
  if (!terminalInstances.has(id)) return;
  // Switch to the Terminals tab (activateTab is global in renderer.js)
  if (typeof activateTab === "function") {
    activateTab("terminals");
  }
  focusTerminal(id);
};

window.Terminals = {
  init: initTerminals,
  focus: focusTerminal,
  requestNew: requestNewTerminal,
};
```

- [ ] **Step 2: Initialise the terminals module in `renderer.js`**

In the `init()` function of `renderer.js`, after `renderPorts()`, add:

```js
  window.Terminals.init();
```

- [ ] **Step 3: Verify embedded terminals work end-to-end**

Run: `cd electron && npm start`

Steps:
1. Click the "Terminals" tab
2. Click "+" — a shell picker dropdown should appear
3. Select "PowerShell 7" — a terminal should open with a pwsh prompt
4. Type `echo hello` and press Enter — output should appear
5. Open a second terminal — the tab strip should show two tabs
6. Switch between tabs — each should retain its state
7. Type `exit` in one terminal — the "[exited]" banner should appear with Restart/Close buttons
8. Click Close — the tab should be removed

- [ ] **Step 4: Commit**

```bash
git add electron/renderer/terminals.js electron/renderer/renderer.js
git commit -m "feat(terminals): add xterm.js terminal renderer with tab strip and lifecycle"
```

---

### Task 12: Wire embedded terminals into the presence panel and scanner deduplication

**Files:**
- Modify: `electron/renderer/terminal-presence.js`

Update the terminal presence bridge to merge embedded terminal data from the terminal manager with external scan data.

- [ ] **Step 1: Update `terminal-presence.js` to merge embedded terminals**

Replace the content of `electron/renderer/terminal-presence.js` with:

```js
"use strict";

// Terminal presence bridge — merges external scan data with embedded
// terminal data and forwards the combined list to the chat webview.

let lastExternalData = [];

function initTerminalPresence(chatWebview, electronAPI) {
  if (!electronAPI?.onTerminalData) return;

  electronAPI.onTerminalData((externalTerminals) => {
    lastExternalData = Array.isArray(externalTerminals) ? externalTerminals : [];
    pushMergedDataToWebview(chatWebview);
  });

  // Also re-push when embedded terminals change
  electronAPI.onTerminalCreated?.(() => {
    pushMergedDataToWebview(chatWebview);
  });
  electronAPI.onTerminalExited?.(() => {
    // Small delay to let the terminal manager update state
    setTimeout(() => pushMergedDataToWebview(chatWebview), 200);
  });
}

function getEmbeddedTerminalData() {
  // Read from the Terminals module in the renderer if available
  // The terminal-manager in main process provides data via IPC,
  // but the renderer's Terminals module has the live name/state.
  if (!window.Terminals) return [];

  // Terminals module stores instances internally; we read what the
  // main process sent via terminal:created events and merge with
  // any name changes made in the renderer.
  // For now, we ask the main process for the canonical list.
  return [];
}

function pushMergedDataToWebview(chatWebview) {
  if (!chatWebview) return;

  // The main process scanner already excludes embedded PIDs via
  // setExcludedPids, so lastExternalData is clean. We add embedded
  // terminals from the main process via the scanner's merged output.
  // If the scanner is also merging embedded data, we use that directly.
  // Otherwise we'd need to fetch embedded data separately.
  //
  // For simplicity: the main process terminal-scanner.js handles
  // deduplication. The renderer just forwards what it receives plus
  // any embedded terminal metadata it has locally.

  const merged = [...lastExternalData];

  const script = `
    (() => {
      try {
        window._terminalData = ${JSON.stringify(merged)};
        if (typeof window.renderChannelRoster === 'function') {
          window.renderChannelRoster();
        }
      } catch (e) {
        console.warn('Terminal presence injection failed:', e);
      }
    })();
  `;

  try {
    chatWebview.executeJavaScript(script, true);
  } catch {
    // Webview may not be ready yet — non-fatal
  }
}

window.TerminalPresence = { init: initTerminalPresence };
```

- [ ] **Step 2: Update the scanner in main.js to also emit embedded terminal data**

In `electron/main.js`, modify the terminal scanner wiring in `wireModules()`. Replace the simple `startTerminalScanning(mainWindow)` with:

```js
  // Terminal scanner — merge embedded terminals into scan output
  const { startScanning: startTerminalScanning } = require("./terminal-scanner");
  const terminalManager = require("./terminal-manager");
  terminalManager.setup(mainWindow);

  // Override the scanner's emit to merge embedded terminal data
  const originalSend = mainWindow.webContents.send.bind(mainWindow.webContents);
  const patchedSend = function (channel, ...args) {
    if (channel === "terminal-data") {
      const externalData = args[0] || [];
      const embeddedData = terminalManager.getEmbeddedTerminalData();
      return originalSend(channel, [...embeddedData, ...externalData]);
    }
    return originalSend(channel, ...args);
  };

  // We can't easily patch webContents.send, so instead we modify the
  // scanner to accept a custom emit function.
  startTerminalScanning(mainWindow);
```

Actually, a cleaner approach — modify `terminal-scanner.js` to accept embedded data as a merge source:

In `electron/terminal-scanner.js`, update `performScanCycle`:

Replace:
```js
    if (isWindowAvailable(targetWindow)) {
      targetWindow.webContents.send("terminal-data", entries);
    }
```

With:
```js
    // Merge embedded terminal data if a provider is registered
    const merged = embeddedDataProvider
      ? [...embeddedDataProvider(), ...entries]
      : entries;

    if (isWindowAvailable(targetWindow)) {
      targetWindow.webContents.send("terminal-data", merged);
    }
```

And add at module scope:
```js
let embeddedDataProvider = null;
```

Add a new exported function:
```js
function setEmbeddedDataProvider(fn) {
  embeddedDataProvider = typeof fn === "function" ? fn : null;
}
```

And export it:
```js
module.exports = {
  startScanning,
  stopScanning,
  setExcludedPids,
  setEmbeddedDataProvider,
  // testing exports...
};
```

Then in `electron/main.js` `wireModules()`, wire it up:

```js
  // Terminal scanner + manager integration
  const { startScanning: startTerminalScanning, setExcludedPids, setEmbeddedDataProvider } = require("./terminal-scanner");
  const terminalManager = require("./terminal-manager");
  terminalManager.setup(mainWindow);
  setEmbeddedDataProvider(() => terminalManager.getEmbeddedTerminalData());
  setInterval(() => setExcludedPids(terminalManager.getActivePids()), 1000);
  startTerminalScanning(mainWindow);
```

(This replaces the separate terminal scanner + terminal manager blocks added in Tasks 2 and 9.)

- [ ] **Step 3: Verify embedded terminals appear in the presence panel**

Run: `cd electron && npm start`

Steps:
1. Open the Terminals tab and create a new terminal
2. Switch to the Chat tab
3. The presence panel should show the embedded terminal in the "Terminals" section with a `▶` prefix and the orange accent colour
4. External terminals should also appear below the embedded ones
5. Close the embedded terminal — it should disappear from the presence panel on the next scan cycle

- [ ] **Step 4: Verify clicking an embedded terminal in the presence panel focuses it**

Steps:
1. Create an embedded terminal
2. Switch to the Chat tab
3. Click the embedded terminal entry in the presence panel
4. The app should switch to the Terminals tab and focus that terminal

- [ ] **Step 5: Commit**

```bash
git add electron/terminal-scanner.js electron/renderer/terminal-presence.js electron/main.js
git commit -m "feat(terminals): merge embedded terminals into presence panel and add deduplication"
```

---

### Task 13: Final integration smoke test

**Files:** None (manual verification)

- [ ] **Step 1: Full Phase A verification**

1. Start the app with several external terminal windows open
2. Verify all external terminals appear in the "Terminals" presence section
3. Verify collapse/expand works and persists across tab switches
4. Open and close external terminals — verify the list updates within ~3 seconds

- [ ] **Step 2: Full Phase B verification**

1. Click the Terminals tab
2. Create 3+ terminals with different shells
3. Verify each terminal is interactive (type commands, see output)
4. Switch between terminal tabs — state should be preserved
5. Rename a terminal by double-clicking its tab label
6. Type `exit` in a terminal — verify the exited banner with Restart/Close
7. Click Restart — verify a new terminal opens with the same shell
8. Click the pop-out button — verify the terminals view opens in a new window

- [ ] **Step 3: Integration verification**

1. Create an embedded terminal
2. Open an external terminal window
3. Switch to Chat tab — both should appear in the "Terminals" section
4. Embedded terminal should have `▶` prefix and orange accent
5. External terminal should have blue accent
6. Click the embedded terminal entry — should switch to Terminals tab
7. Close the embedded terminal — should disappear from presence panel
8. Close the external terminal — should disappear within ~3 seconds

- [ ] **Step 4: Commit final checkpoint**

```bash
git commit --allow-empty -m "chore(terminals): Phase A + B integration smoke tested"
```
