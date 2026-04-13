const test = require("node:test");
const assert = require("node:assert/strict");

const { handleDesktopCommand } = require("../desktop-command-bridge.js");

test("handleDesktopCommand forwards browser-open requests to the host renderer", () => {
  const sent = [];
  const handled = handleDesktopCommand(
    {
      type: "desktop_command",
      data: {
        command: "browser_open",
        url: "https://example.com",
        requested_by: "codex",
      },
    },
    (channel, payload) => {
      sent.push([channel, payload]);
    },
  );

  assert.equal(handled, true);
  assert.deepEqual(sent, [
    [
      "desktop-command",
      {
        command: "browser_open",
        url: "https://example.com",
        requested_by: "codex",
      },
    ],
  ]);
});

test("handleDesktopCommand ignores non-browser payloads", () => {
  const sent = [];
  const handled = handleDesktopCommand(
    {
      type: "message",
      data: { sender: "codex", body: "hello" },
    },
    (channel, payload) => {
      sent.push([channel, payload]);
    },
  );

  assert.equal(handled, false);
  assert.deepEqual(sent, []);
});
