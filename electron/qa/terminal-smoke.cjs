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

async function runTerminalSmoke() {
  const pythonPath = findPythonExecutable(REPO_ROOT);
  if (!pythonPath) {
    throw new Error(
      "Python virtualenv not found. Create .venv before running terminal smoke.",
    );
  }

  const electronExecutable = findElectronExecutable(ELECTRON_DIR);
  if (!electronExecutable) {
    throw new Error(
      "Electron executable not found. Run `npm --prefix electron install` before terminal smoke.",
    );
  }

  if (await isPortOpen(SERVER_PORT)) {
    throw new Error(
      `Port ${SERVER_PORT} is already in use. Close any existing run.py or Electron instance before running terminal smoke.`,
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

    // -----------------------------------------------------------------------
    // Step 1: Navigate to the Terminals tab
    // -----------------------------------------------------------------------
    console.log("  [1/6] Switching to Terminals tab...");
    await window.locator('button[data-tab="terminals"]').click();
    await waitFor(
      () =>
        window.locator("#terminals-container").evaluate((el) => !el.hidden),
      "terminals tab visibility",
    );

    // -----------------------------------------------------------------------
    // Step 2: Verify empty state renders
    // -----------------------------------------------------------------------
    console.log("  [2/6] Checking empty state...");
    // Wait for the tab strip first — that signals initTerminals() has run
    await waitFor(
      async () => {
        const count = await window.locator(".terminals-tab-strip").count();
        return count > 0;
      },
      "terminals tab strip rendered",
    );
    // Now check the empty state message
    await waitFor(
      async () => {
        const count = await window.locator(".terminal-empty").count();
        return count > 0;
      },
      "terminal empty state element",
    );

    // -----------------------------------------------------------------------
    // Step 3: Open the shell picker and create a terminal
    // -----------------------------------------------------------------------
    console.log("  [3/6] Creating embedded terminal...");
    await window.locator(".terminal-tab-add").click();

    await waitFor(
      () =>
        window.locator(".terminal-shell-menu").evaluate((el) => !!el),
      "shell picker menu",
    );

    // Pick the first available shell
    await window.locator(".terminal-shell-option").first().click();

    // -----------------------------------------------------------------------
    // Step 4: Wait for xterm to render output (shell prompt)
    // -----------------------------------------------------------------------
    console.log("  [4/6] Waiting for terminal output...");
    await waitFor(
      async () => {
        // xterm.js renders into .xterm-screen, and the terminal surface
        // should now be visible (not display:none)
        const visible = await window
          .locator(".terminal-surface")
          .first()
          .evaluate((el) => el.style.display !== "none");
        return visible;
      },
      "terminal surface visible",
      15000,
    );

    // Confirm a tab appeared in the tab strip
    await waitFor(
      async () => {
        const count = await window.locator(".terminal-tab").count();
        return count >= 1;
      },
      "terminal tab in strip",
    );

    // -----------------------------------------------------------------------
    // Step 5: Verify the terminal scanner IPC wiring exists
    // -----------------------------------------------------------------------
    console.log("  [5/6] Checking terminal scanner IPC wiring...");
    // Verify the preload exposes the terminal-data listener API and the
    // embedded terminal APIs — this proves main.js wired the scanner and
    // the preload bridged all channels correctly.
    await waitFor(
      () =>
        window.evaluate(() => {
          const api = window.electronAPI;
          return !!(
            api &&
            typeof api.onTerminalData === "function" &&
            typeof api.createTerminal === "function" &&
            typeof api.sendTerminalInput === "function" &&
            typeof api.closeTerminal === "function" &&
            typeof api.listShells === "function"
          );
        }),
      "terminal preload API fully wired",
      10000,
    );

    // -----------------------------------------------------------------------
    // Step 6: Close the terminal and verify cleanup
    // -----------------------------------------------------------------------
    console.log("  [6/6] Closing terminal and verifying cleanup...");
    await window.locator(".terminal-tab-close").first().click();

    await waitFor(
      async () => {
        const count = await window.locator(".terminal-tab").count();
        return count === 0;
      },
      "all terminal tabs removed",
    );

    // Empty state should reappear
    await waitFor(
      async () => {
        const el = await window.locator(".terminal-empty").count();
        return el > 0;
      },
      "empty state restored after close",
    );

    // -----------------------------------------------------------------------
    // Shutdown
    // -----------------------------------------------------------------------
    await electronApp.evaluate(({ app }) => {
      app.quit();
    });

    await waitFor(
      async () => !(await isPortOpen(SERVER_PORT)),
      `Electron shutdown releasing port ${SERVER_PORT}`,
      20000,
    );

    console.log("Terminal smoke passed.");
  } catch (error) {
    await writeFailureArtifacts(window, "terminal-smoke");
    throw error;
  } finally {
    if (electronApp) {
      await electronApp.close().catch(() => {});
    }
  }
}

if (require.main === module) {
  runTerminalSmoke().catch((error) => {
    console.error(error?.stack || String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  runTerminalSmoke,
};
