"use strict";

/**
 * terminal-theme-ui.js — Theme selector dropdown and tuning popover.
 *
 * Provides per-terminal UI controls: a grouped theme dropdown (existing +
 * retro) and a gear-icon popover with sliders/toggles for font size, line
 * height, letter spacing, glow intensity, scanline opacity, and effect
 * toggles.
 *
 * This module is require()'d by terminals.js and bundled via esbuild.
 */

const { getTheme, getAllThemes, loadThemeFont } = require("./terminal-themes");
const {
  createScanlineOverlay,
  applyCRTGlow,
  wrapMonitorBorder,
  removeAllEffects,
} = require("./terminal-effects");

// ---------------------------------------------------------------------------
// Theme selector dropdown
// ---------------------------------------------------------------------------

/**
 * Creates the theme selector dropdown with all available themes,
 * grouped into "Themes" (existing) and "Retro" (new) optgroups.
 *
 * @param {string}   terminalId     Terminal instance ID
 * @param {function} onThemeChange  Callback: (terminalId, themeId) => void
 * @returns {HTMLSelectElement}
 */
function createThemeSelector(terminalId, onThemeChange) {
  const select = document.createElement("select");
  select.className = "macro-btn";
  select.title = "Terminal theme";

  const themes = getAllThemes();

  // Existing themes first, retro second (source: design spec grouping)
  const existingIds = ["default", "cyberpunk", "matrix", "dracula"];
  const retroIds = ["c64", "msdos", "apple2", "amber", "nes", "system6"];

  const existingGroup = document.createElement("optgroup");
  existingGroup.label = "Themes";
  for (const id of existingIds) {
    const theme = themes[id];
    if (!theme) continue;
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = theme.name;
    existingGroup.appendChild(opt);
  }
  select.appendChild(existingGroup);

  const retroGroup = document.createElement("optgroup");
  retroGroup.label = "Retro";
  for (const id of retroIds) {
    const theme = themes[id];
    if (!theme) continue;
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = `${theme.name}${theme.era ? ` (${theme.era})` : ""}`;
    retroGroup.appendChild(opt);
  }
  select.appendChild(retroGroup);

  select.addEventListener("change", () => {
    onThemeChange(terminalId, select.value);
  });

  return select;
}

// ---------------------------------------------------------------------------
// Tuning popover
// ---------------------------------------------------------------------------

/**
 * Creates the gear button that toggles the tuning popover.
 * Each terminal instance gets its own button and popover.
 *
 * @param {string}   terminalId          Terminal instance ID
 * @param {function} getTerminalInstance  Returns the terminal instance from the Map
 * @returns {HTMLButtonElement}
 */
function createTuningButton(terminalId, getTerminalInstance) {
  const btn = document.createElement("button");
  btn.className = "macro-btn";
  btn.title = "Theme tuning";
  // Unicode gear symbol (source: U+2699 GEAR)
  btn.textContent = "\u2699";
  btn.style.fontSize = "16px";
  btn.style.padding = "2px 6px";

  let popover = null;

  btn.addEventListener("click", (e) => {
    e.stopPropagation();

    // Toggle existing popover
    if (popover && popover.parentElement) {
      popover.remove();
      popover = null;
      return;
    }

    const inst = getTerminalInstance(terminalId);
    if (!inst) return;

    popover = _buildPopover(terminalId, inst, getTerminalInstance);

    // Position below the button (source: standard popover UX pattern)
    const rect = btn.getBoundingClientRect();
    popover.style.position = "fixed";
    popover.style.top = `${rect.bottom + 4}px`; // 4px gap — visual spacing
    // z-index 10001: above scanline overlay (10), above context menus (10000)
    popover.style.zIndex = "10001";

    document.body.appendChild(popover);

    // Flip to left-aligned if the popover would overflow the right edge
    const popoverRect = popover.getBoundingClientRect();
    if (rect.left + popoverRect.width > window.innerWidth) {
      popover.style.left = `${Math.max(0, rect.right - popoverRect.width)}px`;
    } else {
      popover.style.left = `${rect.left}px`;
    }

    // Close on outside click
    const closeHandler = (ev) => {
      if (!popover.contains(ev.target) && ev.target !== btn) {
        popover.remove();
        popover = null;
        document.removeEventListener("mousedown", closeHandler);
      }
    };
    // Defer listener to avoid catching the current click (source: standard pattern)
    setTimeout(() => document.addEventListener("mousedown", closeHandler), 0);
  });

  return btn;
}

/**
 * Builds the tuning popover DOM with sliders and toggles.
 *
 * @param {string} terminalId
 * @param {object} inst               Terminal instance from the Map
 * @param {function} getTerminalInstance  Getter for fresh instance reference
 * @returns {HTMLDivElement}
 * @private
 */
function _buildPopover(terminalId, inst, getTerminalInstance) {
  const panel = document.createElement("div");
  panel.className = "theme-tuning-popover";
  panel.style.cssText = `
    background: #1a1a2e;
    border: 1px solid #3a3a4a;
    border-radius: 8px;
    padding: 16px;
    width: 260px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    font-family: var(--font-ui, "Segoe UI", Tahoma, sans-serif);
    font-size: 12px;
    color: #ccc;
  `;

  const title = document.createElement("div");
  title.textContent = "Theme Tuning";
  title.style.cssText =
    "font-weight: bold; color: #da7756; margin-bottom: 12px; font-size: 13px;";
  panel.appendChild(title);

  const tuning = inst.tuning || {};

  // Font Size slider (range: 10–24px, source: design spec)
  _addSlider(panel, "Font Size", "px", 10, 24, tuning.fontSize || 13, (val) => {
    inst.terminal.options.fontSize = val;
    inst.tuning.fontSize = val;
    inst.fitAddon.fit();
  });

  // Line Height slider (range: 1.0–2.0, step 0.1, source: design spec)
  _addSlider(
    panel,
    "Line Height",
    "",
    1.0,
    2.0,
    tuning.lineHeight || 1.2,
    (val) => {
      inst.terminal.options.lineHeight = val;
      inst.tuning.lineHeight = val;
      inst.fitAddon.fit();
    },
    0.1,
  );

  // Letter Spacing slider (range: 0–4px, source: design spec)
  _addSlider(
    panel,
    "Letter Spacing",
    "px",
    0,
    4,
    tuning.letterSpacing || 0,
    (val) => {
      inst.terminal.options.letterSpacing = val;
      inst.tuning.letterSpacing = val;
      inst.fitAddon.fit();
    },
  );

  // Glow Intensity slider — only show if theme has a glow colour configured
  const theme = getTheme(inst.theme || "default");
  if (theme.effects.glow.color) {
    // Range: 0–100%, source: design spec
    _addSlider(
      panel,
      "Glow Intensity",
      "%",
      0,
      100,
      tuning.glowIntensity ?? 50,
      (val) => {
        inst.tuning.glowIntensity = val;
        if (inst.effectsState.glow) {
          inst.effectsState.glow.setIntensity(val);
        }
      },
    );
  }

  // Scanline Opacity slider (range: 0–100%, source: design spec)
  _addSlider(
    panel,
    "Scanline Opacity",
    "%",
    0,
    100,
    tuning.scanlineOpacity ?? 30,
    (val) => {
      inst.tuning.scanlineOpacity = val;
      if (inst.effectsState.scanline) {
        inst.effectsState.scanline.setOpacity(val);
      }
    },
  );

  // CRT Scanlines toggle (independent of theme — design spec decision)
  _addToggle(panel, "CRT Scanlines", tuning.scanlines ?? false, (on) => {
    inst.tuning.scanlines = on;
    if (on && !inst.effectsState.scanline) {
      inst.effectsState.scanline = createScanlineOverlay(
        inst.surface,
        inst.tuning.scanlineOpacity ?? 30, // default opacity — design spec
      );
    } else if (!on && inst.effectsState.scanline) {
      inst.effectsState.scanline.remove();
      inst.effectsState.scanline = null;
    }
  });

  // Monitor Border toggle — only show if theme defines a border colour
  if (theme.effects.border.color) {
    _addToggle(
      panel,
      "Monitor Border",
      tuning.border ?? theme.effects.border.enabled,
      (on) => {
        inst.tuning.border = on;
        if (inst.effectsState.border) {
          inst.effectsState.border.setEnabled(on);
        }
      },
    );
  }

  return panel;
}

// ---------------------------------------------------------------------------
// Slider helper
// ---------------------------------------------------------------------------

/**
 * Adds a labelled slider row to a parent element.
 *
 * @param {HTMLElement} parent   Container element
 * @param {string}      label    Display label
 * @param {string}      unit     Unit suffix ("px", "%", or "")
 * @param {number}      min      Minimum value
 * @param {number}      max      Maximum value
 * @param {number}      value    Current value
 * @param {function}    onChange  Callback: (newValue: number) => void
 * @param {number}      [step]   Step increment (auto-calculated if omitted)
 * @private
 */
function _addSlider(parent, label, unit, min, max, value, onChange, step) {
  const row = document.createElement("div");
  row.style.cssText =
    "display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;";

  const lbl = document.createElement("label");
  lbl.textContent = label;
  lbl.style.color = "#aaa";
  row.appendChild(lbl);

  const input = document.createElement("input");
  input.type = "range";
  input.min = min;
  input.max = max;
  // Step: use provided value, or auto-calculate (source: UX heuristic)
  input.step = step || (max - min > 10 ? 1 : 0.1);
  input.value = value;
  // 100px width fits the 260px popover with label and value display
  input.style.cssText = "width: 100px; accent-color: #da7756;";
  row.appendChild(input);

  const val = document.createElement("span");
  val.textContent = _formatValue(value, unit);
  // 40px width accommodates "24px" or "100%" with right alignment
  val.style.cssText =
    "color: #666; width: 40px; text-align: right; font-size: 11px;";
  row.appendChild(val);

  input.addEventListener("input", () => {
    const n = parseFloat(input.value);
    val.textContent = _formatValue(n, unit);
    onChange(n);
  });

  parent.appendChild(row);
}

/**
 * Formats a numeric value with its unit suffix.
 * @private
 */
function _formatValue(n, unit) {
  if (unit === "px") return `${n}px`;
  if (unit === "%") return `${Math.round(n)}%`;
  return `${n}`;
}

// ---------------------------------------------------------------------------
// Toggle helper
// ---------------------------------------------------------------------------

/**
 * Adds a labelled toggle switch row to a parent element.
 *
 * @param {HTMLElement} parent        Container element
 * @param {string}      label         Display label
 * @param {boolean}     initialState  Initial on/off state
 * @param {function}    onChange       Callback: (isOn: boolean) => void
 * @private
 */
function _addToggle(parent, label, initialState, onChange) {
  const row = document.createElement("div");
  row.style.cssText =
    "display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;";

  const lbl = document.createElement("span");
  lbl.textContent = label;
  lbl.style.color = "#aaa";
  row.appendChild(lbl);

  const toggle = document.createElement("div");
  // 36x18px toggle track (source: standard toggle switch dimensions)
  toggle.style.cssText = `
    width: 36px; height: 18px;
    background: ${initialState ? "#da7756" : "#333"};
    border-radius: 9px;
    position: relative;
    cursor: pointer;
    transition: background 0.2s;
  `;

  const knob = document.createElement("div");
  // 14x14px knob with 2px inset (source: standard toggle switch proportions)
  knob.style.cssText = `
    width: 14px; height: 14px;
    background: #fff; border-radius: 50%;
    position: absolute; top: 2px;
    left: ${initialState ? "20px" : "2px"};
    transition: left 0.2s;
  `;
  toggle.appendChild(knob);

  let state = initialState;
  toggle.addEventListener("click", () => {
    state = !state;
    toggle.style.background = state ? "#da7756" : "#333";
    knob.style.left = state ? "20px" : "2px";
    onChange(state);
  });

  row.appendChild(toggle);
  parent.appendChild(row);
}

module.exports = { createThemeSelector, createTuningButton };
