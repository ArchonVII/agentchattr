const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildShellCommandInput,
} = require("../terminal-manager.js");

test("buildShellCommandInput invokes batch files through PowerShell", () => {
  const command = buildShellCommandInput({
    shellId: "pwsh",
    command: '"C:\\AI\\JAgentchattr\\windows\\start_claude.bat"',
  });

  assert.equal(
    command,
    '& "C:\\AI\\JAgentchattr\\windows\\start_claude.bat"\r',
  );
});

test("buildShellCommandInput invokes batch files through cmd with call", () => {
  const command = buildShellCommandInput({
    shellId: "cmd",
    command: '"C:\\AI\\JAgentchattr\\windows\\start_codex.bat"',
  });

  assert.equal(
    command,
    'call "C:\\AI\\JAgentchattr\\windows\\start_codex.bat"\r',
  );
});

test("buildShellCommandInput leaves ordinary commands unchanged", () => {
  const command = buildShellCommandInput({
    shellId: "pwsh",
    command: "python run.py --port 39777",
  });

  assert.equal(command, "python run.py --port 39777\r");
});

test("buildShellCommandInput prepends a PowerShell server bootstrap when requested", () => {
  const command = buildShellCommandInput({
    shellId: "pwsh",
    command: "claude --dangerously-skip-permissions",
    ensureServer: true,
  });

  assert.match(command, /Get-NetTCPConnection -LocalPort 39777/);
  assert.match(command, /Start-Process python -ArgumentList 'run\.py'/);
  assert.match(command, /WorkingDirectory 'C:\\AI\\JAgentchattr'/);
  assert.match(command, /; claude --dangerously-skip-permissions\r$/);
});
