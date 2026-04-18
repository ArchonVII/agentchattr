const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadChatModule() {
  const filename = path.join(__dirname, "..", "static", "chat.js");
  const source = fs.readFileSync(filename, "utf8");
  const noop = () => {};
  const noopTimer = () => 0;
  const sandbox = {
    console,
    Map,
    Set,
    JSON,
    Math,
    Date,
    Promise,
    URL,
    encodeURIComponent,
    decodeURIComponent,
    window: {},
    localStorage: {
      getItem: () => null,
      setItem: noop,
      removeItem: noop,
    },
    document: {
      addEventListener: noop,
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({
        style: {},
        classList: { add: noop, remove: noop },
        appendChild: noop,
        addEventListener: noop,
        querySelector: () => null,
        querySelectorAll: () => [],
      }),
      documentElement: { style: { setProperty: noop }, dataset: {} },
      body: { classList: { add: noop, remove: noop } },
    },
    marked: { parse: (text) => text },
    fetch: async () => ({
      ok: true,
      json: async () => ({ platform: "win32" }),
    }),
    Hub: { emit: noop, on: noop, off: noop },
    Store: { set: noop },
    navigator: { clipboard: { writeText: async () => {} } },
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
    WebSocket: class {},
    confirm: () => true,
    alert: noop,
    setTimeout: noopTimer,
    clearTimeout: noop,
    setInterval: noopTimer,
    clearInterval: noop,
    requestAnimationFrame: noop,
  };
  sandbox.window = sandbox;
  vm.runInNewContext(source, sandbox, { filename });
  return sandbox;
}

test("linkifyPaths marks absolute image paths for inline preview and strips line numbers", () => {
  const sandbox = loadChatModule();
  const html = sandbox.linkifyPaths(
    "See C:/Users/test/Pictures/Screenshots/shot 01.png:42",
  );

  assert.match(html, /image-file-link/);
  assert.match(html, /data-image-path=/);
  assert.doesNotMatch(html, /openPath\('C:\/Users\/test\/Pictures\/Screenshots\/shot 01\.png:42'/);
  assert.match(html, /openPath\('C:\/Users\/test\/Pictures\/Screenshots\/shot 01\.png'/);
});

test("linkifyPaths marks relative image paths for inline preview", () => {
  const sandbox = loadChatModule();
  const html = sandbox.linkifyPaths(
    "Preview Screenshots/2026-04-18 capture.webp before replying.",
  );

  assert.match(html, /image-file-link/);
  assert.match(html, /data-image-path=/);
  assert.match(html, /Screenshots\/2026-04-18 capture\.webp/);
});
