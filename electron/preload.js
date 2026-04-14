const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  onPortData(callback) {
    ipcRenderer.on("port-data", (_event, data) => callback(data));
  },
  onTerminalData(callback) {
    ipcRenderer.on("terminal-data", (_event, data) => callback(data));
  },
  onNotification(callback) {
    ipcRenderer.on("notification", (_event, data) => callback(data));
  },
  onDeepLink(callback) {
    ipcRenderer.on("deep-link", (_event, url) => callback(url));
  },
  onFocusChannel(callback) {
    ipcRenderer.on("focus-channel", (_event, channel) => callback(channel));
  },
  // H-2 fix: forward webview notifications to main process
  sendNotification(payload) {
    ipcRenderer.send("send-notification", payload);
  },
  requestPopOut(view) {
    ipcRenderer.send("pop-out", view);
  },
  openBrowserUrl(url) {
    return ipcRenderer.invoke("open-browser-url", url);
  },
  killProcess(pid) {
    return ipcRenderer.invoke("kill-process", pid);
  },
  getPreference(key) {
    return ipcRenderer.invoke("get-preference", key);
  },
  setPreference(key, value) {
    return ipcRenderer.invoke("set-preference", key, value);
  },
  showOpenDialog(options) {
    return ipcRenderer.invoke("show-open-dialog", options);
  },
  selectFolder() {
    return ipcRenderer.invoke("select-folder");
  },
  // Terminal manager (Phase B — embedded terminals)
  createTerminal(opts) {
    return ipcRenderer.invoke("terminal:create", opts);
  },
  sendTerminalInput(id, data) {
    ipcRenderer.send("terminal:input", { id, data });
  },
  resizeTerminal(id, cols, rows) {
    ipcRenderer.send("terminal:resize", { id, cols, rows });
  },
  closeTerminal(id) {
    ipcRenderer.send("terminal:close", { id });
  },
  openTerminalFile(opts) {
    return ipcRenderer.invoke("terminal:open-file", opts);
  },
  listShells() {
    return ipcRenderer.invoke("terminal:list-shells");
  },
  onTerminalOutput(callback) {
    ipcRenderer.on("terminal:output", (_event, data) => callback(data));
  },
  onTerminalCreated(callback) {
    ipcRenderer.on("terminal:created", (_event, data) => callback(data));
  },
  onTerminalExited(callback) {
    ipcRenderer.on("terminal:exited", (_event, data) => callback(data));
  },

  // Bridge: watcher events and config
  onBridgeEvent(callback) {
    ipcRenderer.on("terminal:bridge-event", (_event, data) => callback(data));
  },
  onWatcherConfigUpdated(callback) {
    ipcRenderer.on("terminal:watcher-config-updated", (_event, data) =>
      callback(data),
    );
  },
  getWatcherConfig() {
    return ipcRenderer.invoke("terminal:watcher-config-get");
  },
  setWatcherConfig(rules) {
    return ipcRenderer.invoke("terminal:watcher-config-set", rules);
  },
  getTerminalSnapshot(id, lineCount) {
    return ipcRenderer.invoke("terminal:snapshot", { id, lineCount });
  },
  sendSnapshotToChat(id, text, agentName) {
    ipcRenderer.send("terminal:bridge-snapshot-to-chat", {
      id,
      text,
      agentName,
    });
  },
  setTerminalIdentity(id, agentName, sessionName) {
    ipcRenderer.send("terminal:set-identity", { id, agentName, sessionName });
  },
  onIdentitySuggested(callback) {
    ipcRenderer.on("terminal:identity-suggested", (_event, data) =>
      callback(data),
    );
  },
});
