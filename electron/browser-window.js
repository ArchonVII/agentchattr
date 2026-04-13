"use strict";

const { BrowserWindow } = require("electron");

let browserWindow = null;

function normaliseBrowserUrl(urlString) {
  if (typeof urlString !== "string" || !urlString.trim()) {
    return null;
  }

  try {
    const parsed = new URL(urlString);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }
    return parsed.toString();
  } catch (_error) {
    return null;
  }
}

function ensureBrowserWindow(parentWindow) {
  if (browserWindow && !browserWindow.isDestroyed()) {
    return browserWindow;
  }

  browserWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    title: "Browser",
    autoHideMenuBar: true,
    parent: parentWindow && !parentWindow.isDestroyed?.() ? parentWindow : undefined,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
    },
  });

  browserWindow.on("closed", () => {
    browserWindow = null;
  });

  return browserWindow;
}

function openBrowserWindow(urlString, parentWindow) {
  const safeUrl = normaliseBrowserUrl(urlString);
  if (!safeUrl) {
    return { success: false, error: "URL must start with http:// or https://" };
  }

  const targetWindow = ensureBrowserWindow(parentWindow);
  void targetWindow.loadURL(safeUrl);
  targetWindow.show();
  targetWindow.focus();

  return { success: true, url: safeUrl };
}

function _resetBrowserWindowForTests() {
  browserWindow = null;
}

module.exports = {
  normaliseBrowserUrl,
  openBrowserWindow,
  _resetBrowserWindowForTests,
};
