const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createBrowserPaneState,
  normaliseBrowserTarget,
  reduceBrowserCommand,
  popoutBrowserPane,
  closeBrowserPane,
} = require("../renderer/browser-pane-state.js");

test("normaliseBrowserTarget defaults to docked and allows window", () => {
  assert.equal(normaliseBrowserTarget(undefined), "docked");
  assert.equal(normaliseBrowserTarget("window"), "window");
  assert.equal(normaliseBrowserTarget("weird"), null);
});

test("reduceBrowserCommand docks valid browser urls into the pane state", () => {
  const initial = createBrowserPaneState();
  const result = reduceBrowserCommand(initial, {
    command: "browser_open",
    target: "docked",
    url: "https://example.com/docs",
    requested_by: "codex",
  });

  assert.equal(result.effect, null);
  assert.equal(result.error, null);
  assert.deepEqual(result.state, {
    visible: true,
    url: "https://example.com/docs",
    requestedBy: "codex",
  });
});

test("reduceBrowserCommand returns a pop-out effect for window targets", () => {
  const initial = createBrowserPaneState();
  const result = reduceBrowserCommand(initial, {
    command: "browser_open",
    target: "window",
    url: "https://example.com",
    requested_by: "codex",
  });

  assert.deepEqual(result.state, initial);
  assert.deepEqual(result.effect, {
    type: "popout",
    url: "https://example.com/",
  });
  assert.equal(result.error, null);
});

test("popoutBrowserPane reuses the current docked url without hiding the pane", () => {
  const initial = {
    visible: true,
    url: "https://example.com/docs",
    requestedBy: "codex",
  };

  const result = popoutBrowserPane(initial);

  assert.deepEqual(result.state, initial);
  assert.deepEqual(result.effect, {
    type: "popout",
    url: "https://example.com/docs",
  });
});

test("closeBrowserPane hides the pane but keeps the last visited url", () => {
  const result = closeBrowserPane({
    visible: true,
    url: "https://example.com/docs",
    requestedBy: "codex",
  });

  assert.deepEqual(result, {
    visible: false,
    url: "https://example.com/docs",
    requestedBy: "codex",
  });
});
