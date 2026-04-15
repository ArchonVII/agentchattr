"use strict";

/**
 * terminal-effects.js — CRT visual effects for terminal surfaces.
 *
 * Provides scanline overlay, phosphor glow, and monitor border effects.
 * Pure DOM manipulation — no xterm.js API calls.  Each function returns
 * a control object with cleanup methods.
 */

// ---------------------------------------------------------------------------
// Scanline overlay
// ---------------------------------------------------------------------------

/**
 * Creates a CRT scanline overlay on top of a terminal surface.
 * Uses CSS gradients to simulate horizontal scan lines and RGB sub-pixel
 * patterns found on real CRT monitors.
 *
 * @param {HTMLElement} surface  The .terminal-surface element (must have position: relative)
 * @param {number}      opacity  Initial opacity 0–100 (default 30)
 * @returns {{ element: HTMLElement, setOpacity: (n: number) => void, remove: () => void }}
 */
function createScanlineOverlay(surface, opacity = 30) {
  const overlay = document.createElement("div");
  overlay.className = "crt-scanline-overlay";
  // z-index 10: above terminal content, below UI popover (z-index 10001)
  overlay.style.cssText = `
    position: absolute;
    top: 0; left: 0; width: 100%; height: 100%;
    background:
      linear-gradient(
        rgba(18, 16, 16, 0) 50%,
        rgba(0, 0, 0, 0.25) 50%
      ),
      linear-gradient(
        90deg,
        rgba(255, 0, 0, 0.06),
        rgba(0, 255, 0, 0.02),
        rgba(0, 0, 255, 0.06)
      );
    background-size: 100% 2px, 3px 100%;
    pointer-events: none;
    z-index: 10;
    opacity: ${opacity / 100};
  `;
  // Gradient values sourced from: user-provided CSS in design spec
  // background-size 2px = one scanline pair height (source: design spec)
  // background-size 3px = RGB sub-pixel triplet width (source: design spec)

  surface.appendChild(overlay);

  return {
    element: overlay,
    /** @param {number} n  Opacity 0–100 */
    setOpacity(n) {
      // Clamp to 0–1 range (source: CSS opacity spec)
      overlay.style.opacity = Math.max(0, Math.min(1, n / 100));
    },
    remove() {
      overlay.remove();
    },
  };
}

// ---------------------------------------------------------------------------
// Phosphor glow
// ---------------------------------------------------------------------------

/**
 * Applies a phosphor glow effect to terminal text via text-shadow.
 * Targets the .xterm element inside the surface.  Uses two shadow layers
 * at different radii for authentic cathode-ray bleed.
 *
 * @param {HTMLElement} surface  The .terminal-surface element
 * @param {string}      color    CSS colour for the glow, e.g. "rgba(51, 255, 51, 0.8)"
 * @param {number}      radius   Glow radius in px (default 5)
 * @returns {{ setIntensity: (n: number) => void, remove: () => void }}
 */
function applyCRTGlow(surface, color, radius = 5) {
  const xtermEl = surface.querySelector(".xterm");
  if (!xtermEl) return { setIntensity() {}, remove() {} };

  const _apply = (r) => {
    // Create half-opacity variant for outer glow layer
    const halfColor = color.replace(
      /[\d.]+\)$/,
      (match) => `${parseFloat(match) * 0.5})`,
    );
    // Inner glow at radius, outer glow at 2x radius (source: design spec CRT bleed model)
    xtermEl.style.textShadow = `0 0 ${r}px ${color}, 0 0 ${r * 2}px ${halfColor}`;
  };

  _apply(radius);

  return {
    /** @param {number} n  Intensity 0–100 */
    setIntensity(n) {
      // Linear scale: 0 = no glow, 100 = 2x base radius (source: linear interpolation)
      const scaledRadius = (radius * 2 * n) / 100;
      _apply(scaledRadius);
    },
    remove() {
      xtermEl.style.textShadow = "";
    },
  };
}

// ---------------------------------------------------------------------------
// Monitor border
// ---------------------------------------------------------------------------

/**
 * Wraps the terminal surface content in a monitor border,
 * simulating the CRT bezel (e.g. C64's blue surround).
 *
 * @param {HTMLElement} surface  The .terminal-surface element
 * @param {string}      color    Border/bezel colour
 * @param {number}      width    Border width in px (default 24)
 * @returns {{ setEnabled: (on: boolean) => void, remove: () => void }}
 */
function wrapMonitorBorder(surface, color, width = 24) {
  surface.style.backgroundColor = color;
  // Padding simulates the physical monitor bezel (source: design spec C64 border)
  surface.style.padding = `${width}px`;

  // Inner .xterm gets a subtle inset to look like a screen recess
  const xtermEl = surface.querySelector(".xterm");
  if (xtermEl) {
    // 4px border-radius for subtle CRT screen curvature (source: design spec)
    xtermEl.style.borderRadius = "4px";
  }

  return {
    /** @param {boolean} on  Whether the border is visible */
    setEnabled(on) {
      if (on) {
        surface.style.backgroundColor = color;
        surface.style.padding = `${width}px`;
      } else {
        surface.style.backgroundColor = "";
        surface.style.padding = "";
      }
    },
    remove() {
      surface.style.backgroundColor = "";
      surface.style.padding = "";
      if (xtermEl) {
        xtermEl.style.borderRadius = "";
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/**
 * Removes all CRT effects from a terminal surface.
 * Cleans up scanline overlay, glow text-shadow, and monitor border.
 *
 * @param {object} effectsState  Object with scanline/glow/border properties
 *                               (each is a return value from the functions above, or null)
 */
function removeAllEffects(effectsState) {
  if (effectsState.scanline) {
    effectsState.scanline.remove();
    effectsState.scanline = null;
  }
  if (effectsState.glow) {
    effectsState.glow.remove();
    effectsState.glow = null;
  }
  if (effectsState.border) {
    effectsState.border.remove();
    effectsState.border = null;
  }
}

module.exports = {
  createScanlineOverlay,
  applyCRTGlow,
  wrapMonitorBorder,
  removeAllEffects,
};
