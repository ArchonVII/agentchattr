const test = require("node:test");
const assert = require("node:assert/strict");

function loadDeepLinksModule() {
  const target = require.resolve("../deep-links.js");
  delete require.cache[target];
  return require("../deep-links.js");
}

const { extractDeepLinkUrl, parseDeepLink } = loadDeepLinksModule();

test("extractDeepLinkUrl returns the first deep-link argument", () => {
  assert.equal(
    extractDeepLinkUrl([
      "electron.exe",
      ".",
      "agentchattr://channel/reviews",
      "agentchattr://port/39777",
    ]),
    "agentchattr://channel/reviews",
  );
});

test("parseDeepLink recognises channel, agent, and port payloads", () => {
  assert.deepEqual(parseDeepLink("agentchattr://channel/reviews"), {
    type: "channel",
    value: "reviews",
  });
  assert.deepEqual(parseDeepLink("agentchattr://agent/codex"), {
    type: "agent",
    value: "codex",
  });
  assert.deepEqual(parseDeepLink("agentchattr://port/39777"), {
    type: "port",
    value: 39777,
  });
});

test("parseDeepLink rejects malformed or empty payloads", () => {
  assert.equal(parseDeepLink("https://example.com"), null);
  assert.equal(parseDeepLink("agentchattr://channel/"), null);
  assert.equal(parseDeepLink("agentchattr://port/not-a-number"), null);
});

test("setupDeepLinks forwards second-instance channel links to the existing window", () => {
  const { setupDeepLinks } = loadDeepLinksModule();
  const eventHandlers = new Map();
  let protocol = null;
  let quitCalled = 0;

  const app = {
    requestSingleInstanceLock() {
      return true;
    },
    quit() {
      quitCalled += 1;
    },
    setAsDefaultProtocolClient(value) {
      protocol = value;
    },
    on(eventName, handler) {
      eventHandlers.set(eventName, handler);
    },
    removeListener(eventName, handler) {
      if (eventHandlers.get(eventName) === handler) {
        eventHandlers.delete(eventName);
      }
    },
  };

  const sent = [];
  let showCalls = 0;
  let focusCalls = 0;
  const mainWindow = {
    isDestroyed() {
      return false;
    },
    show() {
      showCalls += 1;
    },
    focus() {
      focusCalls += 1;
    },
    webContents: {
      isDestroyed() {
        return false;
      },
      send(channel, payload) {
        sent.push([channel, payload]);
      },
    },
  };

  assert.equal(setupDeepLinks(app, () => mainWindow), true);
  assert.equal(protocol, "agentchattr");
  assert.equal(quitCalled, 0);

  const secondInstance = eventHandlers.get("second-instance");
  assert.equal(typeof secondInstance, "function");

  secondInstance(null, ["electron.exe", ".", "agentchattr://channel/reviews"]);

  assert.deepEqual(sent, [["deep-link", { type: "channel", value: "reviews" }]]);
  assert.equal(showCalls, 1);
  assert.equal(focusCalls, 1);
});

test("setupDeepLinks focuses the existing window on a plain relaunch", () => {
  const { setupDeepLinks } = loadDeepLinksModule();
  const eventHandlers = new Map();

  const app = {
    requestSingleInstanceLock() {
      return true;
    },
    quit() {},
    setAsDefaultProtocolClient() {},
    on(eventName, handler) {
      eventHandlers.set(eventName, handler);
    },
    removeListener(eventName, handler) {
      if (eventHandlers.get(eventName) === handler) {
        eventHandlers.delete(eventName);
      }
    },
  };

  const sent = [];
  let showCalls = 0;
  let focusCalls = 0;
  const mainWindow = {
    isDestroyed() {
      return false;
    },
    show() {
      showCalls += 1;
    },
    focus() {
      focusCalls += 1;
    },
    webContents: {
      isDestroyed() {
        return false;
      },
      send(channel, payload) {
        sent.push([channel, payload]);
      },
    },
  };

  assert.equal(setupDeepLinks(app, () => mainWindow), true);

  const secondInstance = eventHandlers.get("second-instance");
  assert.equal(typeof secondInstance, "function");

  secondInstance(null, ["electron.exe", "."]);

  assert.deepEqual(sent, []);
  assert.equal(showCalls, 1);
  assert.equal(focusCalls, 1);
});
