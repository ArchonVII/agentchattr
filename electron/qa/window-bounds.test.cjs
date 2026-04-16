const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isVisibleOnAnyDisplay,
  normaliseWindowBounds,
} = require("../window-bounds.js");

test("keeps saved bounds when they intersect a connected display", () => {
  const savedBounds = { x: -1200, y: 100, width: 1000, height: 700 };
  const displays = [{ workArea: { x: -1920, y: 0, width: 1920, height: 1080 } }];

  assert.equal(isVisibleOnAnyDisplay(savedBounds, displays), true);
  assert.deepEqual(normaliseWindowBounds(savedBounds, displays), savedBounds);
});

test("recentres saved bounds when they are completely off-screen", () => {
  const savedBounds = { x: -4336, y: 307, width: 1637, height: 1027 };
  const displays = [{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }];

  assert.equal(isVisibleOnAnyDisplay(savedBounds, displays), false);
  assert.deepEqual(normaliseWindowBounds(savedBounds, displays), {
    x: 141,
    y: 26,
    width: 1637,
    height: 1027,
  });
});

test("caps fallback size to the available display work area", () => {
  const displays = [{ workArea: { x: 0, y: 40, width: 1024, height: 700 } }];

  assert.deepEqual(normaliseWindowBounds(null, displays), {
    x: 0,
    y: 40,
    width: 1024,
    height: 700,
  });
});
