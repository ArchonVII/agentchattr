const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const { _electron } = require("playwright-core");

const {
  findElectronExecutable,
  findPythonExecutable,
} = require("./helpers.cjs");
const { WEB_UI_BASE_URL, WEB_UI_PORT } = require("../default-ports.js");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const ELECTRON_DIR = path.resolve(__dirname, "..");
const BASE_URL = process.env.AGENTCHATTR_SMOKE_URL || WEB_UI_BASE_URL;
const SERVER_PORT = Number(new URL(BASE_URL).port || String(WEB_UI_PORT));
const ARTIFACT_DIR = path.join(REPO_ROOT, "data", "qa-artifacts");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const finish = (value) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(value);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

async function waitFor(fn, label, timeoutMs = 30000, intervalMs = 250) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value) {
        return value;
      }
    } catch (error) {
      lastError = error;
    }

    await sleep(intervalMs);
  }

  const detail = lastError ? `: ${lastError.message}` : "";
  throw new Error(`Timed out waiting for ${label}${detail}`);
}

async function isServerReady(baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/`, { redirect: "manual" });
    return response.ok;
  } catch (_error) {
    return false;
  }
}

function ensureArtifactDir() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

async function writeFailureArtifacts(page, prefix) {
  ensureArtifactDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  if (page) {
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, `${prefix}-${stamp}.png`),
      fullPage: true,
    });
  }
}

async function runDesktopSmoke() {
  const pythonPath = findPythonExecutable(REPO_ROOT);
  if (!pythonPath) {
    throw new Error(
      "Python virtualenv not found. Create .venv before running desktop smoke.",
    );
  }

  const electronExecutable = findElectronExecutable(ELECTRON_DIR);
  if (!electronExecutable) {
    throw new Error(
      "Electron executable not found. Run `npm --prefix electron install` before desktop smoke.",
    );
  }

  if (await isPortOpen(SERVER_PORT)) {
    throw new Error(
      `Port ${SERVER_PORT} is already in use. Close any existing run.py or Electron instance before running desktop smoke.`,
    );
  }

  let electronApp = null;
  let window = null;

  try {
    electronApp = await _electron.launch({
      executablePath: electronExecutable,
      args: [ELECTRON_DIR],
    });

    window = await electronApp.firstWindow();
    await window.waitForLoadState("domcontentloaded");

    await waitFor(() => isServerReady(BASE_URL), "Electron embedded server", 45000);

    await window.locator('button[data-tab="ports"]').click();
    await waitFor(
      () =>
        window.locator("#ports-container").evaluate((element) => {
          return !element.hidden;
        }),
      "ports tab visibility",
    );
    await waitFor(
      async () =>
        (await window.locator(".ports-title").textContent())?.trim() === "Ports",
      "ports shell render",
    );

    await window.locator('button[data-tab="chat"]').click();
    await waitFor(
      async () =>
        (await window
          .locator('button[data-tab="chat"]')
          .getAttribute("aria-selected")) === "true",
      "chat tab activation",
    );

    await electronApp.evaluate(({ BrowserWindow }) => {
      const mainWindow = BrowserWindow.getAllWindows()[0];
      if (!mainWindow) {
        throw new Error("No BrowserWindow available for smoke focus test.");
      }
      mainWindow.webContents.send("focus-channel", "planning");
    });

    await waitFor(
      async () =>
        (await window
          .locator('button[data-tab="chat"]')
          .getAttribute("aria-selected")) === "true",
      "chat tab after focus-channel",
    );

    await waitFor(
      () =>
        window.evaluate(async () => {
          const webview = document.getElementById("chat-webview");
          if (!webview) {
            return false;
          }

          try {
            return (
              (await webview.executeJavaScript(
                "localStorage.getItem('agentchattr-channel')",
                true,
              )) === "planning"
            );
          } catch (_error) {
            return false;
          }
        }),
      "focus-channel propagation into the chat webview",
      15000,
    );

    await electronApp.evaluate(({ app }) => {
      app.quit();
    });

    await waitFor(
      async () => !(await isPortOpen(SERVER_PORT)),
      `Electron shutdown releasing port ${SERVER_PORT}`,
      20000,
    );

    console.log("Desktop smoke passed.");
  } catch (error) {
    await writeFailureArtifacts(window, "desktop-smoke");
    throw error;
  } finally {
    if (electronApp) {
      await electronApp.close().catch(() => {});
    }
  }
}

if (require.main === module) {
  runDesktopSmoke().catch((error) => {
    console.error(error?.stack || String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  runDesktopSmoke,
};
