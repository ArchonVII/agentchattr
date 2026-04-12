const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  buildSmokeAgentDefinition,
  buildSmokeAgentExtraArgs,
  findElectronExecutable,
  findPythonExecutable,
} = require("./helpers.cjs");

test("buildSmokeAgentDefinition returns a launcher-safe custom agent definition", () => {
  const definition = buildSmokeAgentDefinition({
    name: "smokebot42",
    label: "Smoke Bot",
    command: "C:\\repo\\.venv\\Scripts\\python.exe",
  });

  assert.deepEqual(definition, {
    name: "smokebot42",
    label: "Smoke Bot",
    command: "C:\\repo\\.venv\\Scripts\\python.exe",
    color: "#06b6d4",
  });
});

test("buildSmokeAgentExtraArgs embeds the sentinel and keeps the process alive", () => {
  const extraArgs = buildSmokeAgentExtraArgs({
    sentinel: "QA_READY",
    sleepSeconds: 42,
  });

  assert.match(extraArgs, /QA_READY/);
  assert.match(extraArgs, /time\.sleep\(42\)/);
  assert.match(extraArgs, /flush=True/);
});

test("findPythonExecutable prefers the local virtualenv", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agentchattr-python-"));
  const pythonPath = path.join(root, ".venv", "Scripts", "python.exe");
  fs.mkdirSync(path.dirname(pythonPath), { recursive: true });
  fs.writeFileSync(pythonPath, "");

  assert.equal(findPythonExecutable(root, "win32"), pythonPath);
});

test("findElectronExecutable resolves the bundled Windows binary", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agentchattr-electron-"));
  const electronPath = path.join(
    root,
    "node_modules",
    "electron",
    "dist",
    "electron.exe",
  );
  fs.mkdirSync(path.dirname(electronPath), { recursive: true });
  fs.writeFileSync(electronPath, "");

  assert.equal(findElectronExecutable(root, "win32"), electronPath);
});
