const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildRestoreLaunchBody,
  normalizeAgentLogEvent,
  normalizeManagedAgentsPayload,
  normalizeRestoreAgentsPayload,
} = require("../static/launcher.js");

test("normalizeManagedAgentsPayload reads backend data shape", () => {
  assert.deepEqual(normalizeManagedAgentsPayload({ data: [{ name: "bot" }] }), [
    { name: "bot" },
  ]);
  assert.deepEqual(
    normalizeManagedAgentsPayload({ processes: [{ name: "bot-2" }] }),
    [{ name: "bot-2" }],
  );
});

test("normalizeRestoreAgentsPayload accepts raw arrays and wrapped arrays", () => {
  assert.deepEqual(normalizeRestoreAgentsPayload([{ base: "bot" }]), [
    { base: "bot" },
  ]);
  assert.deepEqual(normalizeRestoreAgentsPayload({ data: [{ base: "bot" }] }), [
    { base: "bot" },
  ]);
  assert.deepEqual(
    normalizeRestoreAgentsPayload({ agents: [{ base: "review-bot" }] }),
    [{ base: "review-bot" }],
  );
});

test("normalizeAgentLogEvent unwraps websocket payload nesting", () => {
  assert.deepEqual(
    normalizeAgentLogEvent({ data: { name: "bot", line: "crashed" } }),
    { name: "bot", line: "crashed", lines: [] },
  );
  assert.deepEqual(
    normalizeAgentLogEvent({ name: "bot", lines: ["a", "b"] }),
    { name: "bot", line: "", lines: ["a", "b"] },
  );
});

test("buildRestoreLaunchBody preserves relaunch config", () => {
  assert.deepEqual(
    buildRestoreLaunchBody({
      base: "bot",
      name: "review-bot",
      cwd: "C:/repo",
      flags: [],
      extra_args: ["--dangerously-skip-permissions", "--json"],
      instance_label: "review-bot",
    }),
    {
      cwd: "C:/repo",
      flags: [],
      extra_args: ["--dangerously-skip-permissions", "--json"],
      instance_label: "review-bot",
    },
  );

  assert.deepEqual(
    buildRestoreLaunchBody({
      base: "bot",
      name: "bot-2",
      flags: [],
      extra_args: [],
    }),
    {
      flags: [],
      extra_args: [],
      instance_label: "bot-2",
    },
  );
});
