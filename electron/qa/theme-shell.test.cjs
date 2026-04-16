const net = require("node:net");
const test = require("node:test");
const assert = require("node:assert/strict");

const { _electron } = require("playwright-core");

const {
  findElectronExecutable,
  findPythonExecutable,
} = require("./helpers.cjs");
const { WEB_UI_BASE_URL, WEB_UI_PORT } = require("../default-ports.js");

const REPO_ROOT = require("node:path").resolve(__dirname, "..", "..");
const ELECTRON_DIR = require("node:path").resolve(__dirname, "..");
const BASE_URL = WEB_UI_BASE_URL;
const SERVER_PORT = WEB_UI_PORT;

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

async function waitFor(fn, timeoutMs = 30000, intervalMs = 250) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const value = await fn();
    if (value) return value;
    await sleep(intervalMs);
  }

  throw new Error("Timed out waiting for condition");
}

async function isServerReady() {
  try {
    const response = await fetch(`${BASE_URL}/`, { redirect: "manual" });
    return response.ok;
  } catch {
    return false;
  }
}

async function readShellThemeMetrics(window) {
  return window.evaluate(() => {
    const title = document.querySelector(".ports-title");
    const themePicker = document.querySelector("#app-theme-picker");
    const tabButton = document.querySelector(".tab-button");
    const titleStyles = getComputedStyle(title);
    const pickerStyles = getComputedStyle(themePicker);
    const tabStyles = getComputedStyle(tabButton);

    return {
      titleFontFamily: titleStyles.fontFamily,
      titleFontSize: titleStyles.fontSize,
      pickerFontSize: pickerStyles.fontSize,
      tabFontSize: tabStyles.fontSize,
    };
  });
}

test("psone and tui themes keep shell chrome readable", async () => {
  const pythonPath = findPythonExecutable(REPO_ROOT);
  assert.ok(
    pythonPath,
    "Python virtualenv not found. Create .venv before running theme shell test.",
  );

  const electronExecutable = findElectronExecutable(ELECTRON_DIR);
  assert.ok(
    electronExecutable,
    "Electron executable not found. Run `npm --prefix electron install` first.",
  );

  assert.equal(
    await isPortOpen(SERVER_PORT),
    false,
    `Port ${SERVER_PORT} must be free before running the theme shell test.`,
  );

  const electronApp = await _electron.launch({
    executablePath: electronExecutable,
    args: [ELECTRON_DIR],
  });

  try {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState("domcontentloaded");
    await waitFor(() => isServerReady(), 45000);

    await window.locator('button[data-tab="ports"]').click();
    await window.locator(".ports-title").waitFor();

    await window.selectOption("#app-theme-picker", "psone");
    await window.waitForTimeout(300);
    const psone = await readShellThemeMetrics(window);

    assert.ok(
      !psone.titleFontFamily.includes("Final Fantasy Script Collection"),
      `PSone shell chrome should use a readable UI font, got ${psone.titleFontFamily}`,
    );

    await window.selectOption("#app-theme-picker", "tui");
    await window.waitForTimeout(300);
    const tui = await readShellThemeMetrics(window);

    assert.ok(
      parseFloat(tui.pickerFontSize) >= 14,
      `TUI theme picker should scale for the DOS font, got ${tui.pickerFontSize}`,
    );
    assert.ok(
      parseFloat(tui.tabFontSize) >= 14,
      `TUI tab chrome should scale for the DOS font, got ${tui.tabFontSize}`,
    );
    assert.ok(
      parseFloat(tui.titleFontSize) >= 18,
      `TUI panel titles should scale for the DOS font, got ${tui.titleFontSize}`,
    );
  } finally {
    await electronApp.close().catch(() => {});
  }
});
