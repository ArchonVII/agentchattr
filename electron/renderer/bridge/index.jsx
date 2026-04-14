import React from "react";
import { createRoot } from "react-dom/client";
import { WatcherSettingsPanel } from "./WatcherSettingsPanel.jsx";
import { BridgeEventBadge } from "./BridgeEventBadge.jsx";

// ---------------------------------------------------------------------------
// Mount points — these divs are inserted by bridge-ui.js into the DOM
// ---------------------------------------------------------------------------

function mountWhenReady() {
  // Settings panel mounts into the toolbar area
  const settingsRoot = document.getElementById("bridge-settings-root");
  if (settingsRoot) {
    createRoot(settingsRoot).render(<WatcherSettingsPanel />);
  }

  // Badge overlay mounts into the terminal tab strip
  const badgeRoot = document.getElementById("bridge-badge-root");
  if (badgeRoot) {
    createRoot(badgeRoot).render(<BridgeEventBadge />);
  }
}

// Wait for bridge-ui.js to create mount points, then initialise
window.addEventListener("bridge:ready", mountWhenReady);

// If mount points already exist (script loaded after bridge-ui.js)
if (document.getElementById("bridge-settings-root")) {
  mountWhenReady();
}
