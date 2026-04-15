/**
 * bridge-ui.js — vanilla JS ↔ React event bridge.
 *
 * Creates DOM mount points for React components and dispatches
 * CustomEvents that React listens for. Called from terminals.js
 * at appropriate lifecycle points.
 */
"use strict";

(function () {
  // Create mount points for React components
  function createMountPoints() {
    // Settings panel root — appended to body (it's a fixed overlay)
    if (!document.getElementById("bridge-settings-root")) {
      const settingsRoot = document.createElement("div");
      settingsRoot.id = "bridge-settings-root";
      document.body.appendChild(settingsRoot);
    }

    // Badge root — inserted into the terminal tab strip
    if (!document.getElementById("bridge-badge-root")) {
      const badgeRoot = document.createElement("div");
      badgeRoot.id = "bridge-badge-root";
      badgeRoot.style.display = "inline-flex";
      badgeRoot.style.alignItems = "center";

      // Try to insert into the tab strip, fall back to body
      const tabStrip = document.querySelector(".terminals-tab-strip");
      if (tabStrip) {
        tabStrip.appendChild(badgeRoot);
      } else {
        document.body.appendChild(badgeRoot);
      }
    }

    // Snapshot handler root — hidden, just handles events
    if (!document.getElementById("bridge-snapshot-root")) {
      const snapshotRoot = document.createElement("div");
      snapshotRoot.id = "bridge-snapshot-root";
      snapshotRoot.style.display = "none";
      document.body.appendChild(snapshotRoot);
    }

    // Signal that mount points are ready
    window.dispatchEvent(new CustomEvent("bridge:ready"));
  }

  // Toggle the watcher settings panel
  window.bridgeUI = {
    toggleSettings() {
      window.dispatchEvent(new CustomEvent("bridge:toggle-settings"));
    },

    requestSnapshot(terminalId) {
      window.dispatchEvent(
        new CustomEvent("bridge:snapshot-request", {
          detail: { terminalId },
        }),
      );
    },

    notifyTerminalCreated(id, meta) {
      window.dispatchEvent(
        new CustomEvent("bridge:terminal-created", { detail: { id, ...meta } }),
      );
    },

    notifyTerminalDestroyed(id) {
      window.dispatchEvent(
        new CustomEvent("bridge:terminal-destroyed", { detail: { id } }),
      );
    },

    notifyLayoutChanged(mode) {
      window.dispatchEvent(
        new CustomEvent("bridge:layout-changed", { detail: { mode } }),
      );
    },
  };

  // Create mount points once DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createMountPoints);
  } else {
    createMountPoints();
  }
})();
