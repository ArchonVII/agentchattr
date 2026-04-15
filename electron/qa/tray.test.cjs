const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const Module = require("node:module");

function loadTrayModule(electronMock) {
  const target = require.resolve("../tray.js");
  delete require.cache[target];

  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "electron") {
      return electronMock;
    }
    return originalLoad(request, parent, isMain);
  };

  try {
    return require("../tray.js");
  } finally {
    Module._load = originalLoad;
  }
}

test("createTray toggles window visibility, supports quit, and setBadge updates the overlay icon", () => {
  class FakeTray extends EventEmitter {
    constructor(icon) {
      super();
      this.icon = icon;
      this.contextMenu = null;
      this.toolTip = null;
      this.destroyed = false;
    }

    setToolTip(value) {
      this.toolTip = value;
    }

    setContextMenu(value) {
      this.contextMenu = value;
    }

    destroy() {
      this.destroyed = true;
    }
  }

  let quitCalls = 0;
  const electronMock = {
    Tray: FakeTray,
    Menu: {
      buildFromTemplate(template) {
        return template;
      },
    },
    nativeImage: {
      createFromPath() {
        return {
          isEmpty() {
            return false;
          },
        };
      },
      createFromDataURL(value) {
        return { value };
      },
    },
    app: {
      quit() {
        quitCalls += 1;
      },
    },
  };

  const { createTray, setBadge } = loadTrayModule(electronMock);

  const overlayCalls = [];
  let visible = true;
  let focusCalls = 0;
  const mainWindow = {
    isDestroyed() {
      return false;
    },
    isVisible() {
      return visible;
    },
    hide() {
      visible = false;
    },
    show() {
      visible = true;
    },
    focus() {
      focusCalls += 1;
    },
    setOverlayIcon(icon, description) {
      overlayCalls.push([icon, description]);
    },
  };

  const tray = createTray(mainWindow);
  assert.equal(tray.toolTip, "clatter");
  assert.equal(tray.contextMenu[0].label, "Show/Hide");
  assert.equal(tray.contextMenu[2].label, "Quit");

  tray.contextMenu[0].click();
  assert.equal(visible, false);

  tray.contextMenu[0].click();
  assert.equal(visible, true);
  assert.equal(focusCalls, 1);

  visible = false;
  tray.emit("double-click");
  assert.equal(visible, true);
  assert.equal(focusCalls, 2);

  setBadge(3);
  setBadge(0);
  assert.equal(overlayCalls.length, 2);
  assert.match(overlayCalls[0][1], /3 unread notifications/);
  assert.deepEqual(overlayCalls[1], [null, ""]);

  tray.contextMenu[2].click();
  assert.equal(quitCalls, 1);
});
