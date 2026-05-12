"use strict";

// md-viewer-window.js — spawn a popup BrowserWindow that loads
// /static/md-viewer.html from the local agentchattr server. Uses the same
// `persist:agentchattr` session partition as the chat webview so the session
// cookie (and therefore /api/file/markdown auth) is inherited automatically.

const path = require("path");
const { BrowserWindow } = require("electron");
const { WEB_UI_PORT } = require("./default-ports");

const VIEWER_WIDTH = 900;
const VIEWER_HEIGHT = 900;
const VIEWER_PARTITION = "persist:agentchattr";

function openMarkdownViewer(filePath) {
  if (typeof filePath !== "string" || !filePath.trim()) {
    return null;
  }

  const url =
    `http://127.0.0.1:${WEB_UI_PORT}/static/md-viewer.html?path=` +
    encodeURIComponent(filePath);

  const win = new BrowserWindow({
    width: VIEWER_WIDTH,
    height: VIEWER_HEIGHT,
    title: path.basename(filePath),
    autoHideMenuBar: true,
    webPreferences: {
      partition: VIEWER_PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.loadURL(url).catch((err) => {
    console.warn("md-viewer: failed to load", url, err.message);
  });

  return win;
}

module.exports = { openMarkdownViewer };
