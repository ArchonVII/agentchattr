"use strict";

const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Poll interval matches a "feels live" cadence without hammering WMI
const DEFAULT_INTERVAL_MS = 3000; // user instruction: 3s for terminal scan

// tasklist CSV output is compact; 2 MB is ample for hundreds of processes
const TASKLIST_BUFFER_BYTES = 2 * 1024 * 1024; // user instruction

// WMI CommandLine fields can be very long; 4 MB avoids truncation
const WMI_BUFFER_BYTES = 4 * 1024 * 1024; // user instruction

// Maps normalised process names to human-readable shell labels.
// Keys are lowercase, .exe-stripped, non-alphanumeric-except-hyphen forms.
const SHELL_EXECUTABLES = new Map([
  ["pwsh", "PowerShell 7"],
  ["powershell", "Windows PowerShell"],
  ["cmd", "Command Prompt"],
  ["bash", "Bash"],
  ["wsl", "WSL"],
  ["git-bash", "Git Bash"],
]);

// Windows Terminal's host process name (normalised, no .exe)
const WT_PROCESS_NAME = "windowsterminal"; // user instruction

// ---------------------------------------------------------------------------
// Assertions  (none required at module load time for this scanner)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let scanTimer = null;
let scanInFlight = false;
let targetWindow = null;
let excludedPids = new Set(); // PIDs managed by embedded terminals; skip these

// ---------------------------------------------------------------------------
// Knowledge (pure helper functions — no side effects, no I/O)
// ---------------------------------------------------------------------------

/**
 * Normalise a process name for lookup:
 *   - lowercase
 *   - strip trailing .exe
 *   - strip non-alphanumeric characters EXCEPT hyphens
 *
 * Examples:
 *   "WindowsTerminal.exe" → "windowsterminal"
 *   "git-bash.exe"        → "git-bash"
 *   "pwsh.exe"            → "pwsh"
 *
 * @param {string} name
 * @returns {string}
 */
function normaliseProcessName(name) {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\.exe$/i, "")
    .replace(/[^a-z0-9-]/g, "");
}

/**
 * Parse CSV rows produced by Get-CimInstance Win32_Process output.
 *
 * Expected header (first line): "PID","Name","CommandLine","ParentProcessId","CreationDate"
 * Each subsequent line is a quoted-CSV data row. Inner quotes are doubled ("").
 *
 * Returns an array of plain objects with numeric pid/parentPid and string fields.
 *
 * @param {string} stdout
 * @returns {Array<{pid:number, name:string, commandLine:string, parentPid:number, creationDate:string}>}
 */
function parseWmicOutput(stdout) {
  const lines = stdout.split(/\r?\n/).filter(Boolean);
  const results = [];

  for (const line of lines) {
    // Match five quoted CSV fields.  Inner double-quotes are escaped as "".
    // Field pattern: "((?:[^"]|"")*)"  — any char except ", or a pair of ""
    const match = line.match(
      /^"((?:[^"]|"")*)","((?:[^"]|"")*)","((?:[^"]|"")*)","((?:[^"]|"")*)","((?:[^"]|"")*)"$/,
    );

    if (!match) {
      continue;
    }

    const [, rawPid, name, commandLine, rawParentPid, creationDate] = match;
    const pid = parseInt(rawPid, 10);
    const parentPid = parseInt(rawParentPid, 10);

    if (Number.isNaN(pid)) {
      continue;
    }

    results.push({
      pid,
      name: name.replace(/""/g, '"'),
      commandLine: commandLine.replace(/""/g, '"'),
      parentPid: Number.isNaN(parentPid) ? null : parentPid,
      creationDate: creationDate.replace(/""/g, '"'),
    });
  }

  return results;
}

/**
 * Return the human-readable shell label for a normalised process name,
 * or null if not in the SHELL_EXECUTABLES map.
 *
 * @param {string} processName  Already-normalised (use normaliseProcessName first)
 * @returns {string|null}
 */
function shellLabelFromName(processName) {
  return SHELL_EXECUTABLES.get(processName) ?? null;
}

/**
 * Parse a WMI creation date into a Unix timestamp (milliseconds).
 *
 * WMI format: "YYYYMMDDHHmmss.ffffffzzz" where zzz is UTC offset e.g. "+000"
 * Also accepts ISO 8601 strings as a fallback.
 * Returns Date.now() on parse failure rather than null, so the entry still
 * appears (just with an imprecise start time).
 *
 * @param {string} wmicDate
 * @returns {number}  Unix epoch milliseconds
 */
function parseCreationDate(wmicDate) {
  if (!wmicDate) {
    return Date.now();
  }

  // WMI format: 20240413153045.123456+000
  const wmiMatch = wmicDate.match(
    /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\.\d+([+-]\d{3})$/,
  );

  if (wmiMatch) {
    const [, year, month, day, hour, min, sec, offset] = wmiMatch;
    // Convert WMI UTC offset "+HHH" to ISO offset "+HH:00"
    const sign = offset[0];
    const rawHours = parseInt(offset.slice(1), 10); // e.g. 000 → 0, 060 → 60
    // WMI offset is in minutes expressed as a three-digit number
    const offsetHours = Math.floor(rawHours / 60)
      .toString()
      .padStart(2, "0");
    const offsetMins = (rawHours % 60).toString().padStart(2, "0");
    const iso = `${year}-${month}-${day}T${hour}:${min}:${sec}${sign}${offsetHours}:${offsetMins}`;
    const ms = Date.parse(iso);
    if (!Number.isNaN(ms)) {
      return ms;
    }
  }

  // ISO 8601 fallback
  const ms = Date.parse(wmicDate);
  return Number.isNaN(ms) ? Date.now() : ms;
}

/**
 * Derive a human-readable window/session title from the process command line.
 *
 * Heuristics (applied in order):
 *   1. cd <dir> → show the target directory basename
 *   2. Common script names (e.g. "node server.js") → "node server.js"
 *   3. Fall back to the processName label
 *
 * @param {string} commandLine
 * @param {string} processName  Normalised name
 * @returns {string}
 */
function deriveWindowTitle(commandLine, processName) {
  if (commandLine) {
    // cd into a directory: grab the last path segment
    const cdMatch = commandLine.match(/\bcd\s+(?:"([^"]+)"|(\S+))/i);
    if (cdMatch) {
      const dir = cdMatch[1] ?? cdMatch[2];
      const parts = dir.replace(/\\/g, "/").split("/").filter(Boolean);
      if (parts.length > 0) {
        return parts[parts.length - 1];
      }
    }

    // node / python / deno / bun running a named script
    const scriptMatch = commandLine.match(
      /(?:node|python[3]?|deno|bun)\s+(?:.*[\\/])?([^\\/\s]+\.(?:js|ts|py|mjs|cjs))/i,
    );
    if (scriptMatch) {
      return scriptMatch[1];
    }
  }

  // Fall back to readable shell label, then raw normalised name
  return shellLabelFromName(processName) ?? processName;
}

// ---------------------------------------------------------------------------
// I/O helpers
// ---------------------------------------------------------------------------

/**
 * Query shell processes and WindowsTerminal.exe via PowerShell Get-CimInstance.
 *
 * Returns raw process records straight from WMI — no filtering yet.
 *
 * @returns {Promise<Array<{pid,name,commandLine,parentPid,creationDate}>>}
 */
async function scanTerminalProcesses() {
  // Build the shell name filter.  Include wt.exe so we can identify
  // which shell PIDs are children of Windows Terminal tabs.
  const shellNames = Array.from(SHELL_EXECUTABLES.keys())
    .map((n) => `Name LIKE '${n}.exe'`)
    .join(" OR ");

  const filter = `${shellNames} OR Name LIKE 'WindowsTerminal.exe' OR Name LIKE 'git-bash.exe'`;

  // Output one quoted-CSV line per process: "PID","Name","CommandLine","ParentProcessId","CreationDate"
  const psCommand =
    `Get-CimInstance Win32_Process -Filter '${filter}' | ` +
    `ForEach-Object { ` +
    `'\"' + $_.ProcessId + '\",' + ` +
    `'\"' + ($_.Name -replace '\"','\"\"') + '\",' + ` +
    `'\"' + ($_.CommandLine -replace '\"','\"\"') + '\",' + ` +
    `'\"' + $_.ParentProcessId + '\",' + ` +
    `'\"' + $_.CreationDate + '\"' ` +
    `}`;

  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NoLogo", "-Command", psCommand],
    {
      maxBuffer: WMI_BUFFER_BYTES,
      windowsHide: true,
      timeout: 10000, // 10 s — WMI can be slow on busy machines
    },
  );

  return parseWmicOutput(stdout);
}

/**
 * Filter raw process records to actionable terminal entries.
 *
 * Rules:
 *   - Skip WindowsTerminal.exe itself (it's a host, not a shell session)
 *   - Only include processes whose normalised name is in SHELL_EXECUTABLES
 *   - Skip any PID in excludedPids (managed by embedded terminal)
 *   - Mark each entry with windowTerminalTab=true if its parentPid belongs
 *     to a WindowsTerminal.exe process in the same snapshot
 *
 * Sorted by startedAt descending (most recent first).
 *
 * @param {Array} rawProcesses  Output of scanTerminalProcesses()
 * @returns {Array}
 */
function buildTerminalEntries(rawProcesses) {
  // Collect all wt.exe PIDs so we can flag child shells as WT tabs
  const wtPids = new Set(
    rawProcesses
      .filter((p) => normaliseProcessName(p.name) === WT_PROCESS_NAME)
      .map((p) => p.pid),
  );

  const entries = [];

  for (const proc of rawProcesses) {
    const normName = normaliseProcessName(proc.name);

    // Skip the WT host process itself
    if (normName === WT_PROCESS_NAME) {
      continue;
    }

    // Only track known shell executables
    if (!SHELL_EXECUTABLES.has(normName)) {
      continue;
    }

    // Skip PIDs that are managed by the embedded terminal panel
    if (excludedPids.has(proc.pid)) {
      continue;
    }

    const startedAt = parseCreationDate(proc.creationDate);
    const windowTitle = deriveWindowTitle(proc.commandLine, normName);

    entries.push({
      id: `ext-${proc.pid}`,
      pid: proc.pid,
      name: windowTitle,
      shell: normName,
      source: "external",
      status: "running",
      startedAt,
      cwd: null,
      windowTerminalTab: wtPids.has(proc.parentPid),
    });
  }

  // Most recently started first
  entries.sort((a, b) => b.startedAt - a.startedAt);

  return entries;
}

// ---------------------------------------------------------------------------
// Scanning lifecycle
// ---------------------------------------------------------------------------

/**
 * Guard check: is the Electron window still alive and able to receive IPCs?
 *
 * @param {Electron.BrowserWindow|null} win
 * @returns {boolean}
 */
function isWindowAvailable(win) {
  if (!win) {
    return false;
  }

  if (typeof win.isDestroyed === "function" && win.isDestroyed()) {
    return false;
  }

  if (!win.webContents) {
    return false;
  }

  if (
    typeof win.webContents.isDestroyed === "function" &&
    win.webContents.isDestroyed()
  ) {
    return false;
  }

  return true;
}

/**
 * Execute one scan cycle: query WMI, build entries, send to renderer.
 * Re-entrant: skips if a previous cycle is still running.
 */
async function performScanCycle() {
  if (scanInFlight) {
    return;
  }

  scanInFlight = true;

  try {
    let rawProcesses;

    try {
      rawProcesses = await scanTerminalProcesses();
    } catch (error) {
      console.error(
        "terminal-scanner: Failed to query terminal processes:",
        error,
      );
      return;
    }

    const entries = buildTerminalEntries(rawProcesses);

    if (isWindowAvailable(targetWindow)) {
      targetWindow.webContents.send("terminal-data", entries);
    }
  } catch (error) {
    console.error("terminal-scanner: Scan cycle failed:", error);
  } finally {
    scanInFlight = false;
  }
}

/**
 * Start the terminal scanner, sending "terminal-data" IPC events to mainWindow.
 *
 * Calling startScanning again replaces the previous timer and target window.
 *
 * @param {Electron.BrowserWindow} mainWindow
 * @param {number} [intervalMs]  Defaults to DEFAULT_INTERVAL_MS (3000 ms)
 */
function startScanning(mainWindow, intervalMs = DEFAULT_INTERVAL_MS) {
  stopScanning();

  targetWindow = mainWindow ?? null;

  const safeIntervalMs =
    Number.isFinite(intervalMs) && intervalMs > 0
      ? intervalMs
      : DEFAULT_INTERVAL_MS;

  void performScanCycle();

  scanTimer = setInterval(() => {
    void performScanCycle();
  }, safeIntervalMs);
}

/**
 * Stop the terminal scanner and release the window reference.
 */
function stopScanning() {
  if (scanTimer) {
    clearInterval(scanTimer);
    scanTimer = null;
  }

  targetWindow = null;
}

/**
 * Update the set of PIDs that are managed by embedded terminal panels.
 * These PIDs are excluded from the "external" list to avoid duplicates.
 *
 * @param {number[]|Set<number>} pids
 */
function setExcludedPids(pids) {
  excludedPids = new Set(pids);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // Lifecycle
  startScanning,
  stopScanning,
  setExcludedPids,

  // Exported for testing
  normaliseProcessName,
  parseWmicOutput,
  shellLabelFromName,
  buildTerminalEntries,
  parseCreationDate,
};
