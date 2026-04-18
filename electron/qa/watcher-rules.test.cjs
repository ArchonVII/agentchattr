const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { WatcherEngine } = require("../watcher-engine");

const DEFAULT_RULES_PATH = path.join(
  __dirname,
  "..",
  "default-watcher-rules.json",
);
const RUNTIME_RULES_PATH = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "watcher-rules.json",
);

function loadRuleIds(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return new Set((raw.rules || []).map((rule) => rule.id));
}

test("default and runtime watcher rules include agent completion/question capture", () => {
  for (const filePath of [DEFAULT_RULES_PATH, RUNTIME_RULES_PATH]) {
    const ids = loadRuleIds(filePath);
    assert.ok(
      ids.has("builtin-agent-finished"),
      `${path.basename(filePath)} is missing builtin-agent-finished`,
    );
    assert.ok(
      ids.has("builtin-agent-question"),
      `${path.basename(filePath)} is missing builtin-agent-question`,
    );
  }
});

test("WatcherEngine captures natural agent completion phrasing", () => {
  const engine = new WatcherEngine(RUNTIME_RULES_PATH);
  const events = [];
  engine.onMatch((event) => events.push(event));

  engine.scan(
    "term-1",
    "I'm done with the screenshot review.\n",
    { name: "pwsh 1", agentName: "codex" },
  );

  assert.equal(events.length, 1);
  assert.equal(events[0].category, "completion");
  assert.equal(events[0].ruleId, "builtin-agent-finished");
});

test("WatcherEngine prioritizes follow-up questions when an agent finishes and asks what next", () => {
  const engine = new WatcherEngine(RUNTIME_RULES_PATH);
  const events = [];
  engine.onMatch((event) => events.push(event));

  engine.scan(
    "term-2",
    "Done with the screenshots. What should I do next?\n",
    { name: "pwsh 2", agentName: "codex" },
  );

  assert.equal(events.length, 1);
  assert.equal(events[0].category, "question");
  assert.equal(events[0].ruleId, "builtin-agent-question");
});
