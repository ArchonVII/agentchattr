"use strict";

// md-preview.js — chat-side decorator for watcher messages that captured a
// markdown file path. Adds an "Open" button to the message bubble that pops
// up the file in a new themed Electron BrowserWindow (via the desktopBridge
// IPC chain) or falls back to a new tab when running in a plain browser.

(function () {
  const MD_CATEGORY = "markdown_reference";

  function buildOpenButton(filePath) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "md-preview-open";
    btn.textContent = "Open in viewer";
    btn.title = "Open " + filePath;
    btn.dataset.mdPath = filePath;
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      openMarkdownPath(filePath);
    });
    return btn;
  }

  function openMarkdownPath(filePath) {
    // Electron path: use the host bridge so the popup lands as a managed
    // BrowserWindow with the correct partition + theme inheritance.
    if (
      window.desktopBridge &&
      typeof window.desktopBridge.sendCommand === "function"
    ) {
      window.desktopBridge.sendCommand({
        command: "open_markdown",
        path: filePath,
      });
      return;
    }
    // Browser fallback: open the viewer page directly.
    const url = "/static/md-viewer.html?path=" + encodeURIComponent(filePath);
    window.open(url, "_blank", "noopener,width=900,height=900");
  }

  function hydrateMarkdownPreview(messageEl, msg) {
    if (!messageEl || !msg) return;
    const meta = msg.metadata || {};
    if (meta.category !== MD_CATEGORY) return;
    const captured = meta.captured;
    if (typeof captured !== "string" || !captured.trim()) return;

    if (messageEl.querySelector(".md-preview-open")) return; // already decorated

    const host = messageEl.querySelector(".msg-text") || messageEl;
    const wrap = document.createElement("div");
    wrap.className = "md-preview-actions";
    wrap.appendChild(buildOpenButton(captured));
    host.appendChild(wrap);
  }

  window.MdPreview = {
    hydrate: hydrateMarkdownPreview,
    open: openMarkdownPath,
  };
})();
