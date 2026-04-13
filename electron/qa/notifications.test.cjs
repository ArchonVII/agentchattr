const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const Module = require("node:module");

function loadNotificationsModule(electronMock) {
  const target = require.resolve("../notifications.js");
  delete require.cache[target];

  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "electron") {
      return electronMock;
    }
    return originalLoad(request, parent, isMain);
  };

  try {
    return require("../notifications.js");
  } finally {
    Module._load = originalLoad;
  }
}

test("setupNotifications increments badges, focuses the window on click, and clears unread on focus", () => {
  class FakeNotification extends EventEmitter {
    static instances = [];

    constructor(options) {
      super();
      this.options = options;
      this.shown = false;
      FakeNotification.instances.push(this);
    }

    show() {
      this.shown = true;
    }
  }

  const ipcMain = new EventEmitter();
  const electronMock = {
    Notification: FakeNotification,
    ipcMain,
    nativeImage: {
      createFromDataURL(value) {
        return { value };
      },
    },
  };

  const { setupNotifications } = loadNotificationsModule(electronMock);

  const badgeUpdates = [];
  const focusChannelEvents = [];
  const mainWindow = new EventEmitter();
  let showCalls = 0;
  let focusCalls = 0;

  mainWindow.isDestroyed = () => false;
  mainWindow.show = () => {
    showCalls += 1;
  };
  mainWindow.focus = () => {
    focusCalls += 1;
  };
  mainWindow.webContents = {
    isDestroyed() {
      return false;
    },
    send(channel, payload) {
      focusChannelEvents.push([channel, payload]);
    },
  };

  setupNotifications(mainWindow, {
    setBadge(count) {
      badgeUpdates.push(count);
    },
  });

  ipcMain.emit("send-notification", null, {
    title: "codex mentioned you",
    body: "@user please check #planning",
    channel: "planning",
  });

  assert.equal(FakeNotification.instances.length, 1);
  assert.equal(FakeNotification.instances[0].shown, true);
  assert.equal(FakeNotification.instances[0].options.title, "codex mentioned you");
  assert.deepEqual(badgeUpdates, [1]);

  FakeNotification.instances[0].emit("click");

  assert.equal(showCalls, 1);
  assert.equal(focusCalls, 1);
  assert.deepEqual(focusChannelEvents, [["focus-channel", "planning"]]);

  mainWindow.emit("focus");
  assert.deepEqual(badgeUpdates, [1, 0]);
});
