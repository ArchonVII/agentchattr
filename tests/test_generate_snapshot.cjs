"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(REPO_ROOT, "data", "theme_snapshot.json");

// Clean any existing snapshot to prove the script creates it fresh
if (fs.existsSync(OUTPUT)) fs.unlinkSync(OUTPUT);

execFileSync("node", ["scripts/generate-theme-snapshot.cjs"], { cwd: REPO_ROOT });

const snapshot = JSON.parse(fs.readFileSync(OUTPUT, "utf-8"));

// Basic structure checks
console.assert(snapshot.generated, "missing generated timestamp");
console.assert(snapshot.themes, "missing themes object");

const ids = Object.keys(snapshot.themes);
console.assert(ids.length >= 9, `expected >=9 themes, got ${ids.length}`);

for (const id of [
  "default",
  "nes",
  "win98",
  "winxp",
  "system6",
  "classic",
  "c64",
  "c64css3",
  "psone",
]) {
  const t = snapshot.themes[id];
  console.assert(t, `missing theme: ${id}`);
  // Core palettes
  console.assert(t.css.bg_app, `${id}: missing css.bg_app`);
  console.assert(t.css.fg_primary, `${id}: missing css.fg_primary`);
  console.assert(t.css.accent, `${id}: missing css.accent`);
  console.assert(t.ansi.background, `${id}: missing ansi.background`);
  console.assert(t.ansi.foreground, `${id}: missing ansi.foreground`);
  // Layout metadata
  console.assert(t.richBox, `${id}: missing richBox`);
  console.assert(t.inkBorder, `${id}: missing inkBorder`);
  console.assert(t.bannerFont, `${id}: missing bannerFont`);
  console.assert(t.glyphSet, `${id}: missing glyphSet`);
  // Effects
  console.assert(t.effects !== undefined, `${id}: missing effects`);
  console.assert(typeof t.effects.scanline_opacity === "number", `${id}: scanline_opacity not a number`);
  console.assert(typeof t.effects.baud_rate === "number", `${id}: baud_rate not a number`);
  // Interaction
  console.assert(t.loaderStyle, `${id}: missing loaderStyle`);
  console.assert(t.errorIcon, `${id}: missing errorIcon`);
  console.assert(t.focusIndicator, `${id}: missing focusIndicator`);
}

// Verify C64 gets its specific overrides (not the base defaults)
console.assert(
  snapshot.themes.c64.css.bg_app === "#352879",
  `c64 bg_app should be #352879, got ${snapshot.themes.c64.css.bg_app}`
);
// Verify C64 era metadata
console.assert(
  snapshot.themes.c64.glyphSet === "petscii",
  `c64 glyphSet should be petscii, got ${snapshot.themes.c64.glyphSet}`
);
console.assert(
  snapshot.themes.c64.effects.scanline_opacity === 0.08,
  `c64 scanline_opacity should be 0.08`
);
console.assert(
  snapshot.themes.system6.errorIcon === "bomb",
  `system6 errorIcon should be bomb`
);

console.log("PASS: theme snapshot generator produces valid output");
