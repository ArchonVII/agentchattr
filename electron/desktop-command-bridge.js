"use strict";

function handleDesktopCommand(data, sendToHost) {
  if (!data || typeof data !== "object" || data.type !== "desktop_command") {
    return false;
  }

  const payload = data.data;
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const known =
    payload.command === "browser_open" || payload.command === "open_markdown";
  if (!known) {
    return false;
  }
  if (payload.command === "browser_open" && typeof payload.url !== "string") {
    return false;
  }
  if (payload.command === "open_markdown" && typeof payload.path !== "string") {
    return false;
  }

  sendToHost("desktop-command", payload);
  return true;
}

module.exports = {
  handleDesktopCommand,
};
