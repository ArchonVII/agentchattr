const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");

const { chromium } = require("playwright-core");

const {
  buildSmokeAgentDefinition,
  buildSmokeAgentExtraArgs,
  findPythonExecutable,
} = require("./helpers.cjs");
const { WEB_UI_BASE_URL, WEB_UI_PORT } = require("../default-ports.js");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const BASE_URL = process.env.AGENTCHATTR_SMOKE_URL || WEB_UI_BASE_URL;
const SERVER_PORT = Number(new URL(BASE_URL).port || String(WEB_UI_PORT));
const ARTIFACT_DIR = path.join(REPO_ROOT, "data", "qa-artifacts");
const BROWSER_CHANNEL = process.platform === "win32" ? "msedge" : "chrome";

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

async function stopChildProcess(child) {
  if (!child || child.exitCode !== null) {
    return;
  }

  child.kill();

  try {
    await waitFor(
      async () => child.exitCode !== null || !(await isPortOpen(SERVER_PORT)),
      "smoke server shutdown",
      10000,
    );
  } catch (_error) {
    if (process.platform === "win32") {
      spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
      await waitFor(
        async () => child.exitCode !== null || !(await isPortOpen(SERVER_PORT)),
        "taskkill server shutdown",
        10000,
      );
      return;
    }

    child.kill("SIGKILL");
    await waitFor(
      async () => child.exitCode !== null || !(await isPortOpen(SERVER_PORT)),
      "forced smoke server shutdown",
      10000,
    );
  }
}

async function startServer(pythonPath) {
  if (await isPortOpen(SERVER_PORT)) {
    throw new Error(
      `Port ${SERVER_PORT} is already in use. Stop any existing agentchattr server before running launcher smoke.`,
    );
  }

  const logs = [];
  const child = spawn(pythonPath, ["run.py"], {
    cwd: REPO_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  const capture = (chunk) => {
    const lines = chunk
      .toString()
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean);

    logs.push(...lines);
    if (logs.length > 300) {
      logs.splice(0, logs.length - 300);
    }
  };

  child.stdout.on("data", capture);
  child.stderr.on("data", capture);

  await waitFor(async () => {
    if (child.exitCode !== null) {
      throw new Error(`run.py exited early with code ${child.exitCode}`);
    }

    return isServerReady(BASE_URL);
  }, "agentchattr web server", 45000);

  return {
    child,
    logs,
    async stop() {
      await stopChildProcess(child);
    },
  };
}

function ensureArtifactDir() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

async function writeFailureArtifacts(page, serverLogs, prefix) {
  ensureArtifactDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  if (page) {
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, `${prefix}-${stamp}.png`),
      fullPage: true,
    });
  }

  if (serverLogs?.length) {
    fs.writeFileSync(
      path.join(ARTIFACT_DIR, `${prefix}-${stamp}.log`),
      `${serverLogs.join("\n")}\n`,
      "utf-8",
    );
  }
}

function toCookieHeader(cookies) {
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

async function apiJson(pathname, { method = "GET", body, cookieHeader }) {
  const headers = {};
  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${BASE_URL}${pathname}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`${method} ${pathname} failed with HTTP ${response.status}`);
  }

  return response.status === 204 ? null : response.json();
}

async function cleanupSmokeArtifacts(baseName, cookieHeader) {
  if (!cookieHeader) {
    return;
  }

  try {
    const managedPayload = await apiJson("/api/agents/managed", {
      cookieHeader,
    });
    const ours = managedPayload.data.filter((item) => item.base === baseName);

    for (const item of ours) {
      try {
        await apiJson(`/api/agents/${encodeURIComponent(item.name)}/stop`, {
          method: "POST",
          cookieHeader,
        });
      } catch (_error) {
        // Best-effort cleanup.
      }
    }

    await waitFor(async () => {
      const payload = await apiJson("/api/agents/managed", { cookieHeader });
      return payload.data.every((item) => item.base !== baseName);
    }, `${baseName} instances to stop`, 15000);
  } catch (_error) {
    // Continue with definition cleanup even if process cleanup failed.
  }

  try {
    await apiJson(`/api/agent-definitions/${encodeURIComponent(baseName)}`, {
      method: "DELETE",
      cookieHeader,
    });
  } catch (_error) {
    // The definition may already be gone or still blocked by a live process.
  }

  try {
    await apiJson("/api/agents/restore/dismiss", {
      method: "POST",
      cookieHeader,
    });
  } catch (_error) {
    // Ignore cleanup errors here too.
  }
}

async function assertLauncherPanelOpen(page) {
  await waitFor(
    () =>
      page.locator("#launcher-panel").evaluate((element) => {
        return !element.classList.contains("hidden");
      }),
    "launcher panel",
  );
}

async function runLauncherSmoke() {
  const pythonPath = findPythonExecutable(REPO_ROOT);
  if (!pythonPath) {
    throw new Error(
      "Python virtualenv not found. Create .venv before running launcher smoke.",
    );
  }

  const baseName = `smokeagent${Date.now().toString(36)}`;
  const label = `Smoke Agent ${baseName.slice(-4)}`;
  const sentinel = `SMOKE_READY_${baseName}`;
  const definition = buildSmokeAgentDefinition({
    name: baseName,
    label,
    command: pythonPath,
  });
  const extraArgs = buildSmokeAgentExtraArgs({
    sentinel,
    sleepSeconds: 45,
  });

  let server = null;
  let browser = null;
  let context = null;
  let page = null;
  let cookieHeader = "";

  try {
    server = await startServer(pythonPath);
    browser = await chromium.launch({
      channel: BROWSER_CHANNEL,
      headless: true,
    });
    context = await browser.newContext({
      viewport: { width: 1440, height: 960 },
    });
    await context.addInitScript(() => {
      localStorage.setItem("help_seen", "1");
    });
    page = await context.newPage();

    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
    await page.locator("#launcher-toggle").waitFor();
    await page.click("#launcher-toggle");
    await assertLauncherPanelOpen(page);

    await page.getByRole("button", { name: "+ Add Agent" }).click();
    await page.fill("#new-agent-name", definition.name);
    await page.fill("#new-agent-command", definition.command);
    await page.fill("#new-agent-label", definition.label);
    await page
      .locator("#add-agent-form")
      .getByRole("button", { name: "Save", exact: true })
      .click();

    const card = page.locator(".launcher-card").filter({
      hasText: definition.label,
    });
    await card.waitFor();
    await card.getByRole("button", { name: "Launch", exact: true }).click();
    await page.fill(`#launch-cwd-${definition.name}`, REPO_ROOT);
    await page.fill(`#launch-extra-${definition.name}`, extraArgs);
    await page
      .getByRole("button", { name: `Launch ${definition.label}` })
      .click();

    const firstInstanceName = await waitFor(async () => {
      const payload = await page.evaluate(() =>
        fetch("/api/agents/managed").then((response) => response.json()),
      );
      return (
        payload.data.find((item) => item.base === definition.name)?.name ?? null
      );
    }, "first launcher instance");

    await page.evaluate((name) => {
      return window.toggleAgentLogs(name);
    }, firstInstanceName);
    await waitFor(async () => {
      const text = await page.locator(`#logs-${firstInstanceName}`).textContent();
      return text && text.includes(sentinel);
    }, "launcher log sentinel");

    await card.getByRole("button", { name: "Launch Another" }).click();
    await page.fill(`#launch-cwd-${definition.name}`, REPO_ROOT);
    await page.fill(`#launch-extra-${definition.name}`, extraArgs);
    await page
      .getByRole("button", { name: `Launch ${definition.label}` })
      .click();

    const secondInstanceName = await waitFor(async () => {
      const payload = await page.evaluate(() =>
        fetch("/api/agents/managed").then((response) => response.json()),
      );
      const ours = payload.data.filter((item) => item.base === definition.name);
      if (ours.length < 2) {
        return null;
      }
      return ours.find((item) => item.name !== definition.name)?.name ?? null;
    }, "second launcher instance");

    const restorePayload = await page.evaluate(() =>
      fetch("/api/agents/restore").then((response) => response.json()),
    );
    if (!restorePayload.data.some((item) => item.base === definition.name)) {
      throw new Error(`Restore state never included ${definition.name}`);
    }

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitFor(
      () => page.locator("#restore-banner").isVisible(),
      "restore banner after reload",
    );

    cookieHeader = toCookieHeader(await context.cookies(BASE_URL));

    await page.click("#launcher-toggle");
    await assertLauncherPanelOpen(page);

    for (const instanceName of [firstInstanceName, secondInstanceName]) {
      await waitFor(
        () =>
          page
            .locator(`button.launcher-btn.danger[data-name="${instanceName}"]`)
            .count(),
        `stop control for ${instanceName}`,
      );
      await page
        .locator(`button.launcher-btn.danger[data-name="${instanceName}"]`)
        .click();
      await waitFor(async () => {
        const payload = await page.evaluate(() =>
          fetch("/api/agents/managed").then((response) => response.json()),
        );
        const instance = payload.data.find((item) => item.name === instanceName);
        return (
          !instance ||
          (instance.state !== "running" && instance.state !== "starting")
        );
      }, `${instanceName} to stop`);
    }

    page.once("dialog", (dialog) => dialog.accept());
    await card.getByRole("button", { name: "Delete", exact: true }).click();
    await waitFor(async () => {
      const payload = await page.evaluate(() =>
        fetch("/api/agent-definitions").then((response) => response.json()),
      );
      return !payload.definitions[definition.name];
    }, `${definition.name} definition to delete`);

    console.log(
      `Launcher smoke passed for ${definition.name} and ${secondInstanceName}.`,
    );
  } catch (error) {
    await writeFailureArtifacts(page, server?.logs ?? [], "launcher-smoke");
    throw error;
  } finally {
    if (!cookieHeader && context) {
      cookieHeader = toCookieHeader(await context.cookies(BASE_URL));
    }

    await cleanupSmokeArtifacts(baseName, cookieHeader);

    if (browser) {
      await browser.close();
    }
    if (server) {
      await server.stop();
    }
  }
}

if (require.main === module) {
  runLauncherSmoke().catch((error) => {
    console.error(error?.stack || String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  runLauncherSmoke,
};
