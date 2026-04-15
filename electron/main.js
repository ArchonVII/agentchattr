const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const net = require("net");
const { pathToFileURL } = require("url");
const { openBrowserWindow } = require("./browser-window");
const { getAppTheme } = require("./renderer/themes/theme-registry");

// --- Constants (CASK: Constants first) ---
const REPO_ROOT = path.resolve(__dirname, "..");
const SERVER_PORT = 8300;
const PYTHON_PATH = path.join(REPO_ROOT, ".venv", "Scripts", "python.exe");
const RENDERER_ENTRY = path.join(__dirname, "renderer", "index.html");
const READY_SIGNAL = "Uvicorn running on";
const FORCE_KILL_DELAY_MS = 5000;

// --- State ---
let mainWindow = null;
let serverProcess = null;
let serverReady = false;
let serverExited = false;
let isQuitting = false;
let forceKillTimer = null;
let stdoutBuffer = "";
let stderrBuffer = "";
let trayInstance = null;
let preferences = null;

// --- Single-instance lock (must happen before app.whenReady) ---
// H-4 fix: acquire lock synchronously at module load
const { setupDeepLinks } = require("./deep-links");
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

function findPythonPath() {
  return fs.existsSync(PYTHON_PATH) ? PYTHON_PATH : null;
}

function registerIpcHandlers() {
  // Pop-out handler — echoes request back to renderer
  ipcMain.on("pop-out", (_event, view) => {
    if (!mainWindow || !view) return;
    mainWindow.webContents.send("notification", {
      type: "pop-out-requested",
      view,
    });
  });

  // Theme broadcast — sync app theme across all windows and update title bar
  ipcMain.on("app-theme-changed", (event, themeId) => {
    BrowserWindow.getAllWindows().forEach((win) => {
      if (win.webContents !== event.sender) {
        win.webContents.send("app-theme-changed", themeId);
      }
    });

    // Update title bar overlay colour to match the new theme
    const theme = getAppTheme(themeId);
    if (theme.preview && mainWindow && !mainWindow.isDestroyed()) {
      try {
        mainWindow.setTitleBarOverlay({
          color: theme.preview.bg,
          symbolColor: theme.preview.fg,
        });
      } catch {
        // setTitleBarOverlay not supported on all platforms — non-fatal
      }
    }
  });

  // H-6 fix: validate PID before calling process.kill()
  ipcMain.handle("kill-process", async (_event, pid) => {
    const safePid = Number.isInteger(pid) && pid > 0 ? pid : null;
    if (!safePid) return { success: false, error: "Invalid PID" };
    try {
      process.kill(safePid);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle("open-browser-url", async (_event, url) => {
    return openBrowserWindow(url, mainWindow);
  });

  // H-1 fix: Do NOT register get-preference, set-preference, or show-open-dialog here.
  // Those are handled by preferences.js and dialogs.js respectively.

  // Forwarded notification from renderer (webview ipc-message bridge)
  // H-2 fix: renderer forwards webview 'send-notification' here
  ipcMain.on("send-notification", (_event, payload) => {
    // Handled by notifications.js — this is a fallback in case notifications
    // module hasn't registered yet. The notifications module uses removeListener
    // before re-registering, so this won't conflict.
  });

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

  ipcMain.handle(
    "terminal:open-file",
    async (_event, { path: filePath, line, cwd }) => {
      const fs = require("fs");
      const path = require("path");
      const { spawn } = require("child_process");

      let fullPath = filePath;
      if (!path.isAbsolute(filePath) && cwd) {
        fullPath = path.resolve(cwd, filePath);
      }

      if (!fs.existsSync(fullPath)) {
        console.warn("File does not exist:", fullPath);
        return { success: false, error: "File does not exist" };
      }

      // Try to open with VS Code if available (it supports line numbers via -g)
      const codeCmd = process.platform === "win32" ? "code.cmd" : "code";
      const args = line ? ["-g", `${fullPath}:${line}`] : [fullPath];

      return new Promise((resolve) => {
        const child = spawn(codeCmd, args, { shell: true });

        child.on("error", (err) => {
          console.warn(
            "Failed to open with VS Code, falling back to shell.openPath:",
            err,
          );
          require("electron").shell.openPath(fullPath);
          resolve({ success: true, fallback: true });
        });

        child.on("exit", (code) => {
          if (code === 0) {
            resolve({ success: true });
          } else {
            // Fallback if code exists but failed for some reason
            require("electron").shell.openPath(fullPath);
            resolve({ success: true, fallback: true });
          }
        });
      });
    },
  );

  ipcMain.handle("select-folder", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  // Bridge: watcher config and snapshot IPC
  ipcMain.handle("terminal:watcher-config-get", () => {
    const tm = require("./terminal-manager");
    return tm.getWatcherRules();
  });

  ipcMain.handle("terminal:watcher-config-set", (_event, rules) => {
    const tm = require("./terminal-manager");
    tm.setWatcherRules(rules);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("terminal:watcher-config-updated", rules);
    }
    return { success: true };
  });

  ipcMain.handle("terminal:snapshot", (_event, { id, lineCount }) => {
    const tm = require("./terminal-manager");
    return tm.getSnapshot(id, lineCount);
  });

  ipcMain.on(
    "terminal:bridge-snapshot-to-chat",
    (_event, { id, text, agentName }) => {
      const tm = require("./terminal-manager");
      const identity = tm.getTerminalIdentity(id);
      const sender =
        agentName ||
        identity?.agentName ||
        identity?.sessionName ||
        `terminal-${id.slice(0, 8)}`;
      const http = require("http");
      const payload = JSON.stringify({
        terminalId: id,
        agentName: sender,
        terminalName: identity?.sessionName || "",
        ruleId: "manual-snapshot",
        category: "snapshot",
        matchedText: text,
        contextLines: [],
        timestamp: Date.now(),
      });
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
          timeout: 3000,
        },
        (res) => res.resume(),
      );
      req.on("error", (err) =>
        console.warn("Snapshot bridge POST failed:", err.message),
      );
      req.write(payload);
      req.end();
    },
  );

  ipcMain.on(
    "terminal:set-identity",
    (_event, { id, agentName, sessionName }) => {
      const tm = require("./terminal-manager");
      tm.setTerminalIdentity(id, agentName, sessionName);
    },
  );
}

function createWindow() {
  if (mainWindow) {
    mainWindow.show();
    return;
  }

  const bounds = preferences
    ? preferences.get("windowBounds")
    : { width: 1200, height: 800 };

  // Read persisted theme to set initial title bar overlay colour
  const storedThemeId = preferences
    ? preferences.get("appTheme") || "default"
    : "default";
  const initialTheme = getAppTheme(storedThemeId);
  const overlayBg = initialTheme.preview?.bg || "#070d0a";
  const overlayFg = initialTheme.preview?.fg || "#d8fff1";

  mainWindow = new BrowserWindow({
    width: bounds.width || 1200,
    height: bounds.height || 800,
    x: bounds.x,
    y: bounds.y,
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: overlayBg,
      symbolColor: overlayFg,
      height: 36,
    },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      webviewTag: true,
    },
  });

  mainWindow.loadURL(pathToFileURL(RENDERER_ENTRY).toString());

  // Save window bounds on move/resize and before close
  const saveBounds = () => {
    if (preferences && mainWindow && !mainWindow.isDestroyed()) {
      preferences.set("windowBounds", mainWindow.getBounds());
    }
  };
  mainWindow.on("moved", saveBounds);
  mainWindow.on("resized", saveBounds);
  mainWindow.on("close", saveBounds);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function waitForServerPort(
  port,
  host = "127.0.0.1",
  retries = 40,
  delayMs = 250,
) {
  return new Promise((resolve, reject) => {
    let attemptsRemaining = retries;
    const tryConnect = () => {
      const socket = net.createConnection({ host, port });
      socket.once("connect", () => {
        socket.end();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        attemptsRemaining -= 1;
        if (attemptsRemaining <= 0) {
          reject(new Error(`Timed out waiting for ${host}:${port}`));
          return;
        }
        setTimeout(tryConnect, delayMs);
      });
    };
    tryConnect();
  });
}

function showStartupError(message) {
  dialog.showErrorBox("clatter desktop", message);
}

async function handleReadySignal() {
  if (serverReady) return;
  serverReady = true;
  try {
    await waitForServerPort(SERVER_PORT);
    createWindow();
    wireModules();
  } catch (error) {
    showStartupError(
      `The Python server reported ready, but port ${SERVER_PORT} never opened.\n\n${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    app.quit();
  }
}

function handleServerOutput(chunk, streamName) {
  const text = chunk.toString();
  const currentBuffer = streamName === "stdout" ? stdoutBuffer : stderrBuffer;
  const nextBuffer = currentBuffer + text;
  const lines = nextBuffer.split(/\r?\n/);
  const remainder = lines.pop() ?? "";
  if (streamName === "stdout") {
    stdoutBuffer = remainder;
  } else {
    stderrBuffer = remainder;
  }
  for (const line of lines) {
    if (line.includes(READY_SIGNAL)) {
      void handleReadySignal();
    }
  }
}

function shutdownServer() {
  if (!serverProcess || serverExited) return;
  // H-5 fix: on Windows, use taskkill for graceful shutdown instead of SIGTERM
  // (SIGTERM is silently coerced to SIGKILL on Windows by Node.js)
  if (process.platform === "win32") {
    const { execFile } = require("child_process");
    // taskkill /T kills the process tree (Python + uvicorn workers)
    execFile(
      "taskkill",
      ["/PID", String(serverProcess.pid), "/T", "/F"],
      (err) => {
        if (err) console.warn("taskkill failed:", err);
      },
    );
  } else {
    try {
      serverProcess.kill("SIGTERM");
    } catch (e) {
      console.warn("SIGTERM failed:", e);
    }
    forceKillTimer = setTimeout(() => {
      if (!serverProcess || serverExited) return;
      try {
        serverProcess.kill("SIGKILL");
      } catch (e) {
        console.warn("SIGKILL failed:", e);
      }
    }, FORCE_KILL_DELAY_MS);
  }
}

function startServer(pythonPath) {
  serverExited = false;

  // Generate fresh theme snapshot before Python boots.
  // Source: CSS-to-ANSI spec Section 7.1.
  try {
    const { execFileSync } = require("child_process");
    execFileSync("node", ["scripts/generate-theme-snapshot.cjs"], {
      cwd: REPO_ROOT,
      timeout: 5000,
    });
  } catch (err) {
    console.warn("Theme snapshot generation failed (non-fatal):", err.message);
  }

  // Pass the active theme to Python via environment variable.
  // Source: CSS-to-ANSI spec Section 7.1.
  const currentAppThemeId = preferences
    ? preferences.get("appTheme") || "default"
    : "default";

  serverProcess = spawn(pythonPath, ["run.py"], {
    cwd: REPO_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, AGENTCHATTR_THEME: currentAppThemeId },
  });

  serverProcess.stdout.on("data", (chunk) =>
    handleServerOutput(chunk, "stdout"),
  );
  serverProcess.stderr.on("data", (chunk) =>
    handleServerOutput(chunk, "stderr"),
  );

  serverProcess.once("error", (error) => {
    showStartupError(
      `Failed to launch the Python server with ${pythonPath}.\n\n${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    app.quit();
  });

  serverProcess.once("exit", (code, signal) => {
    serverExited = true;
    if (forceKillTimer) {
      clearTimeout(forceKillTimer);
      forceKillTimer = null;
    }
    if (!serverReady && !isQuitting) {
      showStartupError(
        `The Python server exited before becoming ready.\n\nExit code: ${code ?? "null"}\nSignal: ${signal ?? "null"}`,
      );
      app.quit();
    }
  });
}

// C-3 fix: wire all satellite modules after window creation
function wireModules() {
  if (!mainWindow) return;

  // Dialogs
  const { setupDialogs } = require("./dialogs");
  setupDialogs(mainWindow);

  // System tray
  const { createTray } = require("./tray");
  trayInstance = createTray(mainWindow);

  // Notifications (needs tray for badge)
  const { setupNotifications } = require("./notifications");
  setupNotifications(mainWindow, trayInstance);

  // Port scanner
  const { startScanning } = require("./port-scanner");
  const scanInterval = preferences.get("portScanInterval") || 5000;
  startScanning(mainWindow, scanInterval);

  // Terminal scanner + manager integration
  const {
    startScanning: startTerminalScanning,
    setExcludedPids,
    setEmbeddedDataProvider,
  } = require("./terminal-scanner");
  const terminalManager = require("./terminal-manager");
  terminalManager.setup(mainWindow);
  setEmbeddedDataProvider(() => terminalManager.getEmbeddedTerminalData());
  setInterval(
    () => setExcludedPids(terminalManager.getActivePids()),
    1000, // sync embedded PIDs every second for deduplication
  );
  startTerminalScanning(mainWindow);

  // Global shortcuts
  const { registerShortcuts } = require("./shortcuts");
  registerShortcuts(mainWindow, preferences);

  // Deep links — already acquired single-instance lock above,
  // now wire the second-instance event handler
  // C-4 fix: deep-links.js sends raw URL string, renderer parses it
  // (deep-links.js already sends { type, value } object — renderer needs to handle that)
  setupDeepLinks(app, () => mainWindow);
}

app.whenReady().then(() => {
  registerIpcHandlers();

  if (!preferences) {
    const { createPreferences } = require("./preferences");
    preferences = createPreferences();
  }

  const pythonPath = findPythonPath();
  if (!pythonPath) {
    showStartupError(
      `Python was not found at:\n${PYTHON_PATH}\n\nCreate the project virtualenv before starting the desktop wrapper.`,
    );
    app.quit();
    return;
  }

  startServer(pythonPath);
});

app.on("before-quit", () => {
  isQuitting = true;
  const { stopScanning } = require("./port-scanner");
  stopScanning();
  const { stopScanning: stopTerminalScanning } = require("./terminal-scanner");
  stopTerminalScanning();
  const terminalManager = require("./terminal-manager");
  terminalManager.closeAll();
  const { unregisterAll } = require("./shortcuts");
  unregisterAll();
  shutdownServer();
});

app.on("window-all-closed", () => {
  app.quit();
});
