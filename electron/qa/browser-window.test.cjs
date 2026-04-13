const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

function loadBrowserWindowModule(electronMock) {
  const target = require.resolve("../browser-window.js");
  delete require.cache[target];

  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "electron") {
      return electronMock;
    }
    return originalLoad(request, parent, isMain);
  };

  try {
    return require("../browser-window.js");
  } finally {
    Module._load = originalLoad;
  }
}

test("normaliseBrowserUrl only accepts http and https urls", () => {
  const { normaliseBrowserUrl } = loadBrowserWindowModule({ BrowserWindow: class {} });

  assert.equal(normaliseBrowserUrl("https://example.com"), "https://example.com/");
  assert.equal(normaliseBrowserUrl("http://localhost:8300/chat"), "http://localhost:8300/chat");
  assert.equal(normaliseBrowserUrl("file:///C:/secret.txt"), null);
  assert.equal(normaliseBrowserUrl("javascript:alert(1)"), null);
});

test("openBrowserWindow creates or reuses an Electron window for browser urls", () => {
  const instances = [];

  class FakeBrowserWindow {
    constructor(options) {
      this.options = options;
      this.loaded = [];
      this.showCalls = 0;
      this.focusCalls = 0;
      this.closedHandler = null;
      instances.push(this);
    }

    loadURL(url) {
      this.loaded.push(url);
      return Promise.resolve();
    }

    show() {
      this.showCalls += 1;
    }

    focus() {
      this.focusCalls += 1;
    }

    isDestroyed() {
      return false;
    }

    on(eventName, handler) {
      if (eventName === "closed") {
        this.closedHandler = handler;
      }
    }
  }

  const {
    openBrowserWindow,
    _resetBrowserWindowForTests,
  } = loadBrowserWindowModule({ BrowserWindow: FakeBrowserWindow });

  _resetBrowserWindowForTests();

  const first = openBrowserWindow("https://example.com", { id: 1 });
  const second = openBrowserWindow("https://openai.com/docs", { id: 1 });

  assert.equal(first.success, true);
  assert.equal(second.success, true);
  assert.equal(instances.length, 1);
  assert.deepEqual(instances[0].loaded, [
    "https://example.com/",
    "https://openai.com/docs",
  ]);
  assert.equal(instances[0].showCalls, 2);
  assert.equal(instances[0].focusCalls, 2);
  assert.equal(instances[0].options.title, "Browser");
});
