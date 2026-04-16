const { execFile } = require("child_process");
const { promisify } = require("util");
const {
  WEB_UI_PORT,
  MCP_HTTP_PORT,
  MCP_SSE_PORT,
  WEB_UI_BASE_URL,
} = require("./default-ports");

const execFileAsync = promisify(execFile);

const DEFAULT_INTERVAL_MS = 5000;
const NETSTAT_ARGS = ["-ano"];
const AGENTS_API_URL = `${WEB_UI_BASE_URL}/api/agents`;
const KNOWN_AGENTCHATTR_PORTS = new Set([
  MCP_HTTP_PORT,
  MCP_SSE_PORT,
  WEB_UI_PORT,
]);
const MAX_HISTORY_ENTRIES = 100;
const NETSTAT_BUFFER_BYTES = 10 * 1024 * 1024;
const TASKLIST_BUFFER_BYTES = 1024 * 1024;

let scanTimer = null;
let scanInFlight = false;
let targetWindow = null;
let previousPortsByKey = new Map(); // key -> { entry, openedAt }
let processNameCache = new Map();
let processMetadataCache = new Map(); // pid -> { commandLine, parentPid, parentName, sessionType, description, userPort }
const history = [];

// Parent process names that indicate user-launched processes
const USER_PARENT_NAMES = new Set([
  "cmd",
  "powershell",
  "pwsh",
  "explorer",
  "windowsterminal",
  "code",
  "conhost",
  "bash",
  "wsl",
  "mintty",
  "alacritty",
  "wezterm",
  "hyper",
  "terminus",
  "tabby",
]);

// Session types that indicate user-launched processes
const USER_SESSION_TYPES = new Set(["console", "rdp-tcp"]);

function parseEndpoint(endpoint) {
  if (!endpoint) {
    return null;
  }

  if (endpoint.startsWith("[")) {
    const separatorIndex = endpoint.lastIndexOf("]:");

    if (separatorIndex === -1) {
      return null;
    }

    const address = endpoint.slice(1, separatorIndex);
    const port = parseInt(endpoint.slice(separatorIndex + 2), 10);

    if (Number.isNaN(port)) {
      return null;
    }

    return { address, port };
  }

  const separatorIndex = endpoint.lastIndexOf(":");

  if (separatorIndex === -1) {
    return null;
  }

  const address = endpoint.slice(0, separatorIndex);
  const port = parseInt(endpoint.slice(separatorIndex + 1), 10);

  if (Number.isNaN(port)) {
    return null;
  }

  return { address, port };
}

function parseNetstatLine(line) {
  const parts = line.trim().split(/\s+/);

  if (parts.length < 5) {
    return null;
  }

  const [protocol, localEndpoint, , state, rawPid] = parts;

  if (state !== "LISTENING") {
    return null;
  }

  const endpoint = parseEndpoint(localEndpoint);

  if (!endpoint) {
    return null;
  }

  const pid = parseInt(rawPid, 10);

  if (Number.isNaN(pid)) {
    return null;
  }

  return {
    protocol,
    address: endpoint.address,
    port: endpoint.port,
    pid,
  };
}

function parseTasklistProcessName(stdout) {
  const firstLine = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine || firstLine.startsWith("INFO:")) {
    return null;
  }

  const match = firstLine.match(/^"((?:[^"]|"")*)"/);

  if (!match) {
    return null;
  }

  return match[1].replace(/""/g, '"');
}

function normaliseToken(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\.exe$/i, "")
    .replace(/[^a-z0-9]+/g, "");
}

function portKey(entry) {
  return `${entry.protocol}|${entry.address}|${entry.port}|${entry.pid}`;
}

function pushHistoryEntry(entry) {
  history.push(entry);

  while (history.length > MAX_HISTORY_ENTRIES) {
    history.shift();
  }
}

function isWindowAvailable(mainWindow) {
  if (!mainWindow) {
    return false;
  }

  if (
    typeof mainWindow.isDestroyed === "function" &&
    mainWindow.isDestroyed()
  ) {
    return false;
  }

  if (!mainWindow.webContents) {
    return false;
  }

  if (
    typeof mainWindow.webContents.isDestroyed === "function" &&
    mainWindow.webContents.isDestroyed()
  ) {
    return false;
  }

  return true;
}

async function scanPorts() {
  const { stdout } = await execFileAsync("netstat", NETSTAT_ARGS, {
    maxBuffer: NETSTAT_BUFFER_BYTES,
    windowsHide: true,
  });

  return stdout
    .split(/\r?\n/)
    .filter((line) => line.includes("LISTENING"))
    .map(parseNetstatLine)
    .filter(Boolean);
}

async function lookupProcessName(pid) {
  const safePid = parseInt(pid, 10);

  if (Number.isNaN(safePid)) {
    return "Unknown";
  }

  try {
    const { stdout } = await execFileAsync(
      "tasklist",
      ["/FI", `PID eq ${safePid}`, "/FO", "CSV", "/NH"],
      {
        maxBuffer: TASKLIST_BUFFER_BYTES,
        windowsHide: true,
      },
    );

    return parseTasklistProcessName(stdout) ?? "Unknown";
  } catch (error) {
    console.warn(`Failed to resolve process name for PID ${safePid}:`, error);
    return "Unknown";
  }
}

async function resolveProcessNames(ports) {
  const activePids = new Set();

  for (const entry of ports) {
    if (Number.isInteger(entry.pid)) {
      activePids.add(entry.pid);
    }
  }

  // Drop vanished PIDs so reused Windows PIDs do not keep stale names.
  for (const cachedPid of Array.from(processNameCache.keys())) {
    if (!activePids.has(cachedPid)) {
      processNameCache.delete(cachedPid);
    }
  }

  const uncachedPids = Array.from(activePids).filter(
    (pid) => !processNameCache.has(pid),
  );

  await Promise.all(
    uncachedPids.map(async (pid) => {
      processNameCache.set(pid, await lookupProcessName(pid));
    }),
  );

  return ports.map((entry) => ({
    ...entry,
    processName: processNameCache.get(entry.pid) ?? "Unknown",
  }));
}

function deriveDescription(commandLine, processName) {
  if (!commandLine) return null;

  const cl = commandLine.toLowerCase();

  // Match common dev tools by command-line keywords
  const patterns = [
    [/\bvite\b/, "Vite dev server"],
    [/\bnext\s+dev\b/, "Next.js dev server"],
    [/\bnuxt\b/, "Nuxt dev server"],
    [/\bangular[\\/]cli\b|ng\s+serve/, "Angular dev server"],
    [/\breact-scripts\s+start\b/, "Create React App"],
    [/\bwebpack[-\s]dev[-\s]server\b/, "Webpack dev server"],
    [/\bastro\s+dev\b/, "Astro dev server"],
    [/\bremix\s+dev\b/, "Remix dev server"],
    [/\bsvelte-kit\b|svelte.*dev/, "SvelteKit dev server"],
    [/\bstorybook\b/, "Storybook"],
    [/\bjupyter\b/, "Jupyter"],
    [/\bflask\b|flask\s+run/, "Flask"],
    [/\bdjango\b|manage\.py\s+runserver/, "Django"],
    [/\buvicorn\b/, "Uvicorn (ASGI)"],
    [/\bgunicorn\b/, "Gunicorn"],
    [/\bfastapi\b/, "FastAPI"],
    [/\bexpress\b/, "Express"],
    [/\bnestjs\b|nest\s+start/, "NestJS"],
    [/\belectron\b/, "Electron"],
    [/\btailwindcss\b/, "Tailwind CSS"],
    [/\blive-server\b/, "Live Server"],
    [/\bhttp-server\b/, "http-server"],
    [/\bserve\b.*\s-[sp]\s/, "serve (static)"],
  ];

  for (const [re, label] of patterns) {
    if (re.test(cl)) return label;
  }

  // Fall back to the script name if it's a node/python command
  const scriptMatch = cl.match(
    /(?:node|python[3]?|ruby|deno|bun)\s+(?:.*[\\/])?([^\\/\s]+\.(?:js|ts|py|rb|mjs|cjs))/i,
  );
  if (scriptMatch) return scriptMatch[1];

  return processName || null;
}

function classifyUserPort(metadata) {
  // If session type is known and is a user session, it's a user port
  if (metadata.sessionType) {
    const st = metadata.sessionType.toLowerCase();
    if (USER_SESSION_TYPES.has(st) || st.startsWith("rdp-tcp")) {
      return true;
    }
    if (st === "services") {
      return false;
    }
  }

  // Check parent process name
  if (metadata.parentName) {
    const parentToken = normaliseToken(metadata.parentName);
    if (USER_PARENT_NAMES.has(parentToken)) {
      return true;
    }
  }

  return false;
}

function parseMetadataOutput(stdout) {
  // Parse CSV output from PowerShell: ProcessId,CommandLine,ParentProcessId,Description
  const results = new Map();
  const lines = stdout.split(/\r?\n/).filter(Boolean);

  for (const line of lines) {
    // Match CSV: "pid","cmdline","ppid","description"
    const match = line.match(
      /^"(\d+)","((?:[^"]|"")*)","(\d+)","((?:[^"]|"")*)"$/,
    );
    if (!match) continue;

    const pid = parseInt(match[1], 10);
    const commandLine = match[2].replace(/""/g, '"');
    const parentPid = parseInt(match[3], 10);
    const description = match[4].replace(/""/g, '"');

    results.set(pid, {
      commandLine,
      parentPid,
      description: description || null,
    });
  }

  return results;
}

function parseSessionInfo(stdout) {
  // Parse tasklist /V CSV output for session type
  const results = new Map();
  const lines = stdout.split(/\r?\n/).filter(Boolean);

  for (const line of lines) {
    // CSV: "ImageName","PID","SessionName","Session#","MemUsage","Status","UserName","CPUTime","WindowTitle"
    const match = line.match(/^"[^"]*","(\d+)","([^"]*)"/);
    if (!match) continue;

    const pid = parseInt(match[1], 10);
    const sessionType = match[2];
    results.set(pid, sessionType);
  }

  return results;
}

async function batchQueryMetadata(pids) {
  if (pids.length === 0) return new Map();

  const results = new Map();

  // Build a PowerShell filter for all PIDs at once
  const filter = pids.map((p) => `ProcessId=${p}`).join(" or ");
  const psCommand = `Get-CimInstance Win32_Process -Filter '${filter}' | Select-Object ProcessId,CommandLine,ParentProcessId,@{N='Desc';E={(Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue).Description}} | ForEach-Object { '\"' + $_.ProcessId + '\",\"' + ($_.CommandLine -replace '\"','\"\"') + '\",\"' + $_.ParentProcessId + '\",\"' + ($_.Desc -replace '\"','\"\"') + '\"' }`;

  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NoLogo", "-Command", psCommand],
      { maxBuffer: NETSTAT_BUFFER_BYTES, windowsHide: true, timeout: 8000 },
    );

    const parsed = parseMetadataOutput(stdout);
    for (const [pid, meta] of parsed) {
      results.set(pid, meta);
    }
  } catch (error) {
    console.warn("Batch metadata query failed:", error);
  }

  // Get session types via tasklist /V for these PIDs
  try {
    const tasks = pids.map(async (pid) => {
      const safePid = parseInt(pid, 10);
      if (Number.isNaN(safePid)) return;

      try {
        const { stdout } = await execFileAsync(
          "tasklist",
          ["/FI", `PID eq ${safePid}`, "/FO", "CSV", "/V", "/NH"],
          {
            maxBuffer: TASKLIST_BUFFER_BYTES,
            windowsHide: true,
            timeout: 4000,
          },
        );

        const sessions = parseSessionInfo(stdout);
        const sessionType = sessions.get(safePid);
        if (sessionType && results.has(safePid)) {
          results.get(safePid).sessionType = sessionType;
        } else if (sessionType) {
          results.set(safePid, {
            commandLine: null,
            parentPid: null,
            description: null,
            sessionType,
          });
        }
      } catch {
        // Individual tasklist failure is non-fatal
      }
    });
    await Promise.all(tasks);
  } catch (error) {
    console.warn("Session type query failed:", error);
  }

  // Resolve parent process names for classification
  const parentPids = new Set();
  for (const meta of results.values()) {
    if (meta.parentPid && !Number.isNaN(meta.parentPid)) {
      parentPids.add(meta.parentPid);
    }
  }

  const parentNames = new Map();
  await Promise.all(
    Array.from(parentPids).map(async (ppid) => {
      const name =
        processNameCache.get(ppid) ?? (await lookupProcessName(ppid));
      parentNames.set(ppid, name);
    }),
  );

  for (const [pid, meta] of results) {
    meta.parentName = parentNames.get(meta.parentPid) ?? null;
    meta.userPort = classifyUserPort(meta);
  }

  return results;
}

async function resolveProcessMetadata(ports) {
  const activePids = new Set();

  for (const entry of ports) {
    if (Number.isInteger(entry.pid)) {
      activePids.add(entry.pid);
    }
  }

  // Drop vanished PIDs
  for (const cachedPid of Array.from(processMetadataCache.keys())) {
    if (!activePids.has(cachedPid)) {
      processMetadataCache.delete(cachedPid);
    }
  }

  const uncachedPids = Array.from(activePids).filter(
    (pid) => !processMetadataCache.has(pid),
  );

  if (uncachedPids.length > 0) {
    const freshMetadata = await batchQueryMetadata(uncachedPids);
    for (const [pid, meta] of freshMetadata) {
      processMetadataCache.set(pid, meta);
    }
  }

  return ports.map((entry) => {
    const meta = processMetadataCache.get(entry.pid);
    if (!meta) return { ...entry, userPort: false };

    // Prefer command-line-derived description (e.g. "Vite dev server")
    // over the generic Windows description (e.g. "Node.js: Server-side JavaScript")
    const derived = deriveDescription(meta.commandLine, entry.processName);

    return {
      ...entry,
      commandLine: meta.commandLine ?? null,
      parentName: meta.parentName ?? null,
      sessionType: meta.sessionType ?? null,
      description: derived ?? meta.description ?? null,
      userPort: meta.userPort ?? false,
    };
  });
}

function findAgentMatch(processName, agents) {
  const processToken = normaliseToken(processName);

  if (!processToken) {
    return null;
  }

  for (const [agentName, details] of Object.entries(agents)) {
    const nameToken = normaliseToken(agentName);
    const labelToken = normaliseToken(details?.label);

    if (
      (nameToken &&
        (processToken.includes(nameToken) ||
          nameToken.includes(processToken))) ||
      (labelToken &&
        (processToken.includes(labelToken) ||
          labelToken.includes(processToken)))
    ) {
      return {
        agent: agentName,
        agentColour: details?.color ?? details?.colour ?? null,
      };
    }
  }

  return null;
}

async function fetchRegisteredAgents() {
  try {
    const response = await fetch(AGENTS_API_URL);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return null;
    }

    return payload;
  } catch (error) {
    console.warn("Failed to fetch registered agents:", error);
    return null;
  }
}

async function tagAgentPorts(ports) {
  const registeredAgents = await fetchRegisteredAgents();
  const agentchattrColour =
    registeredAgents?.agentchattr?.color ??
    registeredAgents?.agentchattr?.colour ??
    null;

  return ports.map((entry) => {
    if (KNOWN_AGENTCHATTR_PORTS.has(entry.port)) {
      return {
        ...entry,
        agent: "agentchattr",
        agentColour: agentchattrColour,
      };
    }

    const matchedAgent = registeredAgents
      ? findAgentMatch(entry.processName, registeredAgents)
      : null;

    if (matchedAgent) {
      return {
        ...entry,
        ...matchedAgent,
      };
    }

    return {
      ...entry,
      agent: "System",
      agentColour: null,
    };
  });
}

function updateHistory(currentPorts) {
  const currentPortsMap = new Map(
    currentPorts.map((entry) => [portKey(entry), entry]),
  );
  const timestamp = Date.now();

  const nextPortsByKey = new Map();

  for (const [key, entry] of currentPortsMap.entries()) {
    if (!previousPortsByKey.has(key)) {
      // New port
      pushHistoryEntry({
        type: "open",
        port: entry.port,
        pid: entry.pid,
        processName: entry.processName ?? "Unknown",
        agent: entry.agent ?? null,
        timestamp,
      });
      nextPortsByKey.set(key, { entry, openedAt: timestamp });
    } else {
      // Existing port, preserve openedAt
      const prev = previousPortsByKey.get(key);
      nextPortsByKey.set(key, { entry, openedAt: prev.openedAt });
    }
  }

  for (const [key, prev] of previousPortsByKey.entries()) {
    if (!currentPortsMap.has(key)) {
      // Closed port
      const entry = prev.entry;
      pushHistoryEntry({
        type: "close",
        port: entry.port,
        pid: entry.pid,
        processName: entry.processName ?? "Unknown",
        agent: entry.agent ?? null,
        timestamp,
      });
    }
  }

  previousPortsByKey = nextPortsByKey;
}

async function performScanCycle() {
  if (scanInFlight) {
    return;
  }

  scanInFlight = true;

  try {
    let scannedPorts;

    try {
      scannedPorts = await scanPorts();
    } catch (error) {
      console.error("Failed to scan listening ports:", error);
      return;
    }

    const portsWithNames = await resolveProcessNames(scannedPorts);
    const taggedPorts = await tagAgentPorts(portsWithNames);
    const enrichedPorts = await resolveProcessMetadata(taggedPorts);

    updateHistory(enrichedPorts);

    // Re-map to include the tracked openedAt
    const portsWithTime = enrichedPorts.map((port) => {
      const key = portKey(port);
      const tracked = previousPortsByKey.get(key);
      return {
        ...port,
        openedAt: tracked ? tracked.openedAt : Date.now(),
      };
    });

    if (isWindowAvailable(targetWindow)) {
      targetWindow.webContents.send("port-data", {
        ports: portsWithTime,
        history: getHistory(),
      });
    }
  } catch (error) {
    console.error("Port scanning cycle failed:", error);
  } finally {
    scanInFlight = false;
  }
}

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

function stopScanning() {
  if (scanTimer) {
    clearInterval(scanTimer);
    scanTimer = null;
  }

  targetWindow = null;
}

function getHistory() {
  return history.slice();
}

module.exports = {
  startScanning,
  stopScanning,
  getHistory,
};
