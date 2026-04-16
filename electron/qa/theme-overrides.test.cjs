const test = require("node:test");
const assert = require("node:assert/strict");

const {
  THEME_OVERRIDE_KEYS,
  sanitizeThemeOverrides,
  buildThemeExport,
} = require("../renderer/themes/theme-overrides.js");

test("sanitizeThemeOverrides keeps only supported theme tokens", () => {
  const overrides = sanitizeThemeOverrides({
    "--bg-app": " #112233 ",
    "--accent": "#ABCDEF",
    "--font-ui": "should-be-ignored",
    "--unknown-token": "#fff",
    "--fg-primary": "",
  });

  assert.deepEqual(overrides, {
    "--bg-app": "#112233",
    "--accent": "#abcdef",
  });
});

test("buildThemeExport returns a portable theme override payload", () => {
  const payload = buildThemeExport("tui", {
    "--bg-app": "#0000aa",
    "--accent": "#ffff55",
  });

  assert.equal(payload.themeId, "tui");
  assert.deepEqual(payload.overrides, {
    "--bg-app": "#0000aa",
    "--accent": "#ffff55",
  });
  assert.deepEqual(payload.tokens, THEME_OVERRIDE_KEYS);
  assert.equal(typeof payload.exportedAt, "string");
});
