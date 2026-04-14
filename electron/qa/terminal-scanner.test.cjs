const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normaliseProcessName,
  parseWmicOutput,
  shellLabelFromName,
  buildTerminalEntries,
  parseCreationDate,
} = require("../terminal-scanner");

// ---------------------------------------------------------------------------
// normaliseProcessName
// ---------------------------------------------------------------------------

test("normaliseProcessName strips .exe and lowercases", () => {
  assert.equal(normaliseProcessName("WindowsTerminal.exe"), "windowsterminal");
  assert.equal(normaliseProcessName("pwsh.EXE"), "pwsh");
  assert.equal(normaliseProcessName("git-bash.exe"), "git-bash");
});

test("normaliseProcessName handles null and empty", () => {
  assert.equal(normaliseProcessName(null), "");
  assert.equal(normaliseProcessName(""), "");
  assert.equal(normaliseProcessName(undefined), "");
});

test("normaliseProcessName strips non-alphanumeric except hyphens", () => {
  assert.equal(normaliseProcessName("some_app.exe"), "someapp");
  assert.equal(normaliseProcessName("my-tool.exe"), "my-tool");
});

// ---------------------------------------------------------------------------
// shellLabelFromName
// ---------------------------------------------------------------------------

test("shellLabelFromName returns label for known shells", () => {
  assert.equal(shellLabelFromName("pwsh"), "PowerShell 7");
  assert.equal(shellLabelFromName("cmd"), "Command Prompt");
  assert.equal(shellLabelFromName("bash"), "Bash");
  assert.equal(shellLabelFromName("wsl"), "WSL");
});

test("shellLabelFromName returns null for unknown names", () => {
  assert.equal(shellLabelFromName("unknownshell"), null);
  assert.equal(shellLabelFromName(""), null);
});

// ---------------------------------------------------------------------------
// parseCreationDate
// ---------------------------------------------------------------------------

test("parseCreationDate parses WMI format", () => {
  // WMI format: YYYYMMDDHHmmss.ffffff+offset (offset in minutes as 3 digits)
  const ms = parseCreationDate("20260414120000.000000+000");
  const date = new Date(ms);
  assert.equal(date.getUTCFullYear(), 2026);
  assert.equal(date.getUTCMonth(), 3); // April = 3 (zero-indexed)
  assert.equal(date.getUTCDate(), 14);
  assert.equal(date.getUTCHours(), 12);
});

test("parseCreationDate falls back to ISO 8601", () => {
  const ms = parseCreationDate("2026-04-14T10:30:00Z");
  const date = new Date(ms);
  assert.equal(date.getUTCHours(), 10);
  assert.equal(date.getUTCMinutes(), 30);
});

test("parseCreationDate returns Date.now() for null/invalid", () => {
  const before = Date.now();
  const ms = parseCreationDate(null);
  const after = Date.now();
  assert.ok(ms >= before && ms <= after);
});

// ---------------------------------------------------------------------------
// parseWmicOutput
// ---------------------------------------------------------------------------

test("parseWmicOutput parses quoted CSV rows", () => {
  const csv = [
    '"1234","pwsh.exe","pwsh.exe -NoLogo","5678","20260414120000.000000+000"',
    '"5678","WindowsTerminal.exe","wt.exe","100","20260414110000.000000+000"',
  ].join("\n");

  const results = parseWmicOutput(csv);
  assert.equal(results.length, 2);
  assert.equal(results[0].pid, 1234);
  assert.equal(results[0].name, "pwsh.exe");
  assert.equal(results[0].parentPid, 5678);
  assert.equal(results[1].pid, 5678);
  assert.equal(results[1].name, "WindowsTerminal.exe");
});

test("parseWmicOutput skips malformed lines", () => {
  const csv = [
    "this is not csv",
    '"1234","pwsh.exe","pwsh.exe","5678","20260414120000.000000+000"',
    "",
  ].join("\n");

  const results = parseWmicOutput(csv);
  assert.equal(results.length, 1);
  assert.equal(results[0].pid, 1234);
});

test("parseWmicOutput handles escaped double quotes", () => {
  const csv =
    '"1234","pwsh.exe","pwsh.exe -Command ""echo hello""","5678","20260414120000.000000+000"';
  const results = parseWmicOutput(csv);
  assert.equal(results.length, 1);
  assert.equal(results[0].commandLine, 'pwsh.exe -Command "echo hello"');
});

// ---------------------------------------------------------------------------
// buildTerminalEntries
// ---------------------------------------------------------------------------

test("buildTerminalEntries filters out WindowsTerminal host", () => {
  const raw = [
    { pid: 100, name: "WindowsTerminal.exe", commandLine: "", parentPid: 1, creationDate: "" },
    { pid: 200, name: "pwsh.exe", commandLine: "pwsh.exe", parentPid: 100, creationDate: "" },
  ];

  const entries = buildTerminalEntries(raw);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].pid, 200);
  assert.equal(entries[0].shell, "pwsh");
  assert.equal(entries[0].source, "external");
  assert.equal(entries[0].windowTerminalTab, true);
});

test("buildTerminalEntries marks non-WT children correctly", () => {
  const raw = [
    { pid: 300, name: "cmd.exe", commandLine: "cmd.exe", parentPid: 1, creationDate: "" },
  ];

  const entries = buildTerminalEntries(raw);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].windowTerminalTab, false);
});

test("buildTerminalEntries skips unknown executables", () => {
  const raw = [
    { pid: 400, name: "notepad.exe", commandLine: "notepad.exe", parentPid: 1, creationDate: "" },
  ];

  const entries = buildTerminalEntries(raw);
  assert.equal(entries.length, 0);
});

test("buildTerminalEntries sorts by startedAt descending", () => {
  const raw = [
    { pid: 500, name: "pwsh.exe", commandLine: "", parentPid: 1, creationDate: "2026-01-01T01:00:00Z" },
    { pid: 600, name: "cmd.exe", commandLine: "", parentPid: 1, creationDate: "2026-01-01T02:00:00Z" },
  ];

  const entries = buildTerminalEntries(raw);
  assert.equal(entries[0].pid, 600); // newer first
  assert.equal(entries[1].pid, 500);
});
