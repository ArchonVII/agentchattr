"use strict";

// md-viewer.js — fetches a markdown file via /api/file/markdown and renders it.
// Used by the Electron popup viewer (BrowserWindow loads /static/md-viewer.html
// with ?path=<absolute-path> on the same partition as the chat webview so the
// session cookie is shared automatically).

(async function () {
  const params = new URLSearchParams(window.location.search);
  const filePath = params.get("path");

  const titleEl = document.getElementById("md-title");
  const bodyEl = document.getElementById("md-body");

  function showError(msg) {
    bodyEl.innerHTML = "";
    const div = document.createElement("div");
    div.className = "error";
    div.textContent = msg;
    bodyEl.appendChild(div);
  }

  if (!filePath) {
    titleEl.textContent = "no file";
    showError("No path provided. Open this window via the chat 'Open' button.");
    return;
  }

  titleEl.textContent = filePath;

  try {
    const resp = await fetch(
      "/api/file/markdown?path=" + encodeURIComponent(filePath),
      { credentials: "same-origin" },
    );
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      showError(`HTTP ${resp.status}: ${body.error || resp.statusText}`);
      return;
    }
    const data = await resp.json();
    document.title = data.name + " — Markdown viewer";
    titleEl.textContent = data.path;

    if (typeof window.marked === "undefined") {
      // Plain-text fallback if the CDN failed to load
      bodyEl.innerHTML = "";
      const pre = document.createElement("pre");
      pre.textContent = data.content;
      bodyEl.appendChild(pre);
      return;
    }

    window.marked.setOptions({ breaks: true, gfm: true });
    bodyEl.innerHTML = window.marked.parse(data.content);
  } catch (err) {
    showError("Failed to load file: " + err.message);
  }
})();
