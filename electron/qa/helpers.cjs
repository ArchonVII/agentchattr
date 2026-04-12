const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_SMOKE_AGENT_COLOUR = "#06b6d4";

function escapePythonString(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function buildSmokeAgentDefinition({
  name,
  label = "Smoke Agent",
  command,
  color = DEFAULT_SMOKE_AGENT_COLOUR,
}) {
  return {
    name,
    label,
    command,
    color,
  };
}

function buildSmokeAgentExtraArgs({
  sentinel = "SMOKE_READY",
  sleepSeconds = 30,
} = {}) {
  const safeSentinel = escapePythonString(sentinel);
  const safeSleepSeconds = Number.isFinite(sleepSeconds)
    ? Math.max(1, Math.floor(sleepSeconds))
    : 30;

  return `-u -c "import time; print('${safeSentinel}', flush=True); time.sleep(${safeSleepSeconds})"`;
}

function findPythonExecutable(rootDir, platform = process.platform) {
  const candidates =
    platform === "win32"
      ? [path.join(rootDir, ".venv", "Scripts", "python.exe")]
      : [path.join(rootDir, ".venv", "bin", "python")];

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function findElectronExecutable(
  electronDir,
  platform = process.platform,
) {
  const candidates =
    platform === "win32"
      ? [path.join(electronDir, "node_modules", "electron", "dist", "electron.exe")]
      : platform === "darwin"
        ? [
            path.join(
              electronDir,
              "node_modules",
              "electron",
              "dist",
              "Electron.app",
              "Contents",
              "MacOS",
              "Electron",
            ),
          ]
        : [path.join(electronDir, "node_modules", "electron", "dist", "electron")];

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

module.exports = {
  DEFAULT_SMOKE_AGENT_COLOUR,
  buildSmokeAgentDefinition,
  buildSmokeAgentExtraArgs,
  findElectronExecutable,
  findPythonExecutable,
};
