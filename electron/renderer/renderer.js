"use strict";

const state = {
  activeTab: "chat",
  portRows: [],
  notice: null,
  pendingChannel: null,
  webviewReady: false,
  browserPane: window.BrowserPaneState.createBrowserPaneState(),
  hideSystem: false,
  sortConfig: { key: "port", direction: "asc" },
};

const CHANNEL_SYNC_RETRY_MS = 250;
const CHANNEL_SYNC_MAX_ATTEMPTS = 40;

const elements = {
  tabButtons: Array.from(document.querySelectorAll(".tab-button")),
  popOutButtons: Array.from(document.querySelectorAll(".pop-out-button")),
  chatShell: document.getElementById("chat-shell"),
  chatWebview: document.getElementById("chat-webview"),
  browserPane: document.getElementById("browser-pane"),
  browserWebview: document.getElementById("browser-webview"),
  browserPaneMeta: document.getElementById("browser-pane-meta"),
  browserPaneUrl: document.getElementById("browser-pane-url"),
  browserPanePopout: document.getElementById("browser-pane-popout"),
  browserPaneClose: document.getElementById("browser-pane-close"),
  portsContainer: document.getElementById("ports-container"),
};

const RESERVED_DEEP_LINK_TARGETS = new Set(["chat", "ports", "channel"]);

function fileUrlToPath(fileUrl) {
  const pathname = decodeURIComponent(new URL(fileUrl).pathname);
  if (/^\/[A-Za-z]:/.test(pathname)) {
    return pathname.slice(1).replace(/\//g, "\\");
  }

  return pathname;
}

function configureWebview() {
  const preloadPath = fileUrlToPath(
    new URL("../preload-webview.js", window.location.href).toString(),
  );
  const currentPreload = elements.chatWebview.getAttribute("preload");

  if (currentPreload === preloadPath) {
    return;
  }

  elements.chatWebview.setAttribute("preload", preloadPath);
  elements.chatWebview.setAttribute(
    "src",
    elements.chatWebview.getAttribute("src"),
  );
}

function activateTab(tabName) {
  state.activeTab = tabName;

  for (const button of elements.tabButtons) {
    const isActive = button.dataset.tab === tabName;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  }

  elements.chatShell.hidden = tabName !== "chat";
  elements.portsContainer.hidden = tabName !== "ports";
}

function readField(row, keys, fallback = "\u2014") {
  for (const key of keys) {
    const value = row?.[key];

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return fallback;
}

function readPid(row) {
  const value = readField(row, ["pid", "processId"], null);
  return value === null ? null : String(value);
}

function normalisePortRows(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.ports)) {
    return payload.ports;
  }

  if (Array.isArray(payload?.rows)) {
    return payload.rows;
  }

  if (Array.isArray(payload?.items)) {
    return payload.items;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  return [];
}

function setNotice(message, tone = "info") {
  state.notice = message ? { message, tone } : null;
}

function buildCell(text, className = "") {
  const cell = document.createElement("td");
  cell.textContent = text;

  if (className) {
    cell.className = className;
  }

  return cell;
}

async function handleKillProcess(pid) {
  if (!pid || !window.electronAPI?.killProcess) {
    return;
  }

  const result = await window.electronAPI.killProcess(pid);

  if (result?.success) {
    setNotice(`Termination signal sent to PID ${pid}.`);
  } else {
    setNotice(result?.error ?? `Unable to terminate PID ${pid}.`, "error");
  }

  renderPorts();
}

function formatTime(timestamp) {
  if (!timestamp) return "\u2014";
  const date = new Date(timestamp);
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function renderPorts() {
  const container = elements.portsContainer;
  container.innerHTML = "";

  const shell = document.createElement("div");
  shell.className = "ports-shell";

  const header = document.createElement("div");
  header.className = "ports-header";

  const titleGroup = document.createElement("div");
  titleGroup.style.display = "flex";
  titleGroup.style.alignItems = "baseline";
  titleGroup.style.gap = "12px";

  const title = document.createElement("h1");
  title.className = "ports-title";
  title.textContent = "Ports";

  const meta = document.createElement("div");
  meta.className = "ports-meta";
  meta.textContent = `${state.portRows.length} total entries`;

  titleGroup.append(title, meta);

  const controls = document.createElement("div");
  controls.className = "ports-controls";

  const hideSystemLabel = document.createElement("label");
  hideSystemLabel.className = "ports-checkbox-label";
  
  const hideSystemCheckbox = document.createElement("input");
  hideSystemCheckbox.type = "checkbox";
  hideSystemCheckbox.checked = state.hideSystem;
  hideSystemCheckbox.addEventListener("change", (e) => {
    state.hideSystem = e.target.checked;
    renderPorts();
  });

  hideSystemLabel.append(hideSystemCheckbox, " Hide System entries");
  controls.appendChild(hideSystemLabel);

  header.append(titleGroup, controls);
  shell.appendChild(header);

  if (state.notice) {
    const notice = document.createElement("div");
    notice.className =
      `ports-notice ${state.notice.tone === "error" ? "error" : ""}`.trim();
    notice.textContent = state.notice.message;
    shell.appendChild(notice);
  }

  let rows = [...state.portRows];
  if (state.hideSystem) {
    rows = rows.filter(r => r.agent !== "System");
  }

  const sortKey = state.sortConfig.key;
  const sortDir = state.sortConfig.direction === "asc" ? 1 : -1;

  rows.sort((a, b) => {
    let valA, valB;
    switch(sortKey) {
      case "port":
        valA = a.port;
        valB = b.port;
        break;
      case "pid":
        valA = parseInt(readPid(a) || "0", 10);
        valB = parseInt(readPid(b) || "0", 10);
        break;
      case "process":
        valA = readField(a, ["process", "processName", "command", "name", "exe"]).toLowerCase();
        valB = readField(b, ["process", "processName", "command", "name", "exe"]).toLowerCase();
        break;
      case "agent":
        valA = readField(a, ["agent", "agentName", "owner", "channel"]).toLowerCase();
        valB = readField(b, ["agent", "agentName", "owner", "channel"]).toLowerCase();
        break;
      case "opened":
        valA = a.openedAt || 0;
        valB = b.openedAt || 0;
        break;
      default:
        return 0;
    }
    if (valA < valB) return -1 * sortDir;
    if (valA > valB) return 1 * sortDir;
    return 0;
  });

  if (rows.length === 0) {
    const empty = document.createElement("div");
    empty.className = "ports-empty";
    empty.innerHTML = state.portRows.length === 0 
      ? "<strong>Waiting for port data</strong><span>Port information will appear here when the Electron main process emits it.</span>"
      : "<strong>No matching ports</strong><span>All current entries are hidden by your filters.</span>";
    shell.appendChild(empty);
    container.appendChild(shell);
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "ports-table-wrap";

  const table = document.createElement("table");
  table.className = "ports-table";

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");

  const columns = [
    { label: "Port", key: "port" },
    { label: "Address", key: null },
    { label: "PID", key: "pid" },
    { label: "Process", key: "process" },
    { label: "Agent", key: "agent" },
    { label: "Opened", key: "opened" },
    { label: "Actions", key: null },
  ];

  for (const col of columns) {
    const th = document.createElement("th");
    th.scope = "col";
    
    if (col.key) {
      th.className = "sortable";
      if (state.sortConfig.key === col.key) {
        th.classList.add(state.sortConfig.direction);
      }
      th.textContent = col.label;
      th.addEventListener("click", () => {
        if (state.sortConfig.key === col.key) {
          state.sortConfig.direction = state.sortConfig.direction === "asc" ? "desc" : "asc";
        } else {
          state.sortConfig.key = col.key;
          state.sortConfig.direction = "asc";
        }
        renderPorts();
      });
    } else {
      th.textContent = col.label;
    }
    headerRow.appendChild(th);
  }

  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  for (const row of rows) {
    const tr = document.createElement("tr");
    const pid = readPid(row);

    tr.appendChild(
      buildCell(
        String(readField(row, ["port", "localPort", "listenPort"])),
        "mono",
      ),
    );
    tr.appendChild(
      buildCell(String(readField(row, ["address", "host", "bind", "ip"]))),
    );
    tr.appendChild(buildCell(pid ?? "\u2014", "mono"));
    tr.appendChild(
      buildCell(
        String(
          readField(row, ["process", "processName", "command", "name", "exe"]),
        ),
        "muted",
      ),
    );
    tr.appendChild(
      buildCell(
        String(readField(row, ["agent", "agentName", "owner", "channel"])),
      ),
    );
    tr.appendChild(
      buildCell(formatTime(row.openedAt), "muted mono"),
    );

    const actionCell = document.createElement("td");
    const killButton = document.createElement("button");
    killButton.type = "button";
    killButton.className = "kill-button";
    killButton.textContent = "Kill";
    killButton.disabled = !pid;
    killButton.addEventListener("click", async () => {
      killButton.disabled = true;
      await handleKillProcess(pid);
      killButton.disabled = !pid;
    });
    actionCell.appendChild(killButton);
    tr.appendChild(actionCell);

    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  wrapper.appendChild(table);
  shell.appendChild(wrapper);
  container.appendChild(shell);
}

async function handleDesktopCommand(payload) {
  const result = window.BrowserPaneState.reduceBrowserCommand(
    state.browserPane,
    payload,
  );
  if (result.error) {
    return;
  }

  state.browserPane = result.state;
  renderBrowserPane();

  if (payload?.target !== "window") {
    activateTab("chat");
  }

  if (result.effect) {
    await runBrowserPaneEffect(result.effect);
  }
}

async function runBrowserPaneEffect(effect) {
  if (!effect || effect.type !== "popout" || !effect.url) {
    return;
  }

  try {
    await window.electronAPI?.openBrowserUrl?.(effect.url);
  } catch (error) {
    console.error("Unable to open browser url:", error);
  }
}

function renderBrowserPane() {
  const pane = state.browserPane;
  const visible = !!pane.visible && !!pane.url;

  elements.browserPane.hidden = !visible;
  elements.browserPaneMeta.textContent = pane.requestedBy
    ? `Requested by ${pane.requestedBy}`
    : "No page open";
  elements.browserPaneUrl.textContent = pane.url || "about:blank";
  elements.browserPanePopout.disabled = !pane.url;
  elements.browserPaneClose.disabled = !visible;

  if (pane.url && elements.browserWebview.getAttribute("src") !== pane.url) {
    elements.browserWebview.setAttribute("src", pane.url);
  }
}

function parseDeepLink(rawUrl) {
  try {
    const url = new URL(rawUrl);

    if (url.protocol !== "agentchattr:") {
      return null;
    }

    const host = url.hostname.toLowerCase();
    const segments = url.pathname
      .split("/")
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment));

    const tabParam = url.searchParams.get("tab")?.toLowerCase();
    let targetTab = tabParam === "ports" ? "ports" : "chat";
    let targetChannel = url.searchParams.get("channel");

    if (host === "ports" || segments[0] === "ports") {
      targetTab = "ports";
    } else if (host === "chat") {
      targetTab = "chat";
      targetChannel ??= segments[0] ?? null;
    } else if (host === "channel") {
      targetTab = "chat";
      targetChannel ??= segments[0] ?? null;
    } else if (host && !RESERVED_DEEP_LINK_TARGETS.has(host)) {
      targetTab = "chat";
      targetChannel ??= host;
    } else if (
      segments[0] &&
      !RESERVED_DEEP_LINK_TARGETS.has(segments[0].toLowerCase())
    ) {
      targetChannel ??= segments[0];
    }

    return {
      tab: targetTab,
      channel: targetChannel ? decodeURIComponent(targetChannel) : null,
    };
  } catch (error) {
    console.error("Unable to parse deep link:", error);
    return null;
  }
}

async function synchronisePendingChannel(attempt = 0) {
  if (!state.pendingChannel || !state.webviewReady) {
    return;
  }

  const channel = state.pendingChannel;
  const script = `
    (() => {
      try {
        const channel = ${JSON.stringify(channel)};
        localStorage.setItem('agentchattr-channel', channel);
        if (typeof window.switchChannel === 'function') {
          window.switchChannel(channel);
          return 'switched';
        }
        return 'stored';
      } catch (error) {
        return 'error:' + error.message;
      }
    })();
  `;

  try {
    const result = await elements.chatWebview.executeJavaScript(script, true);

    if (result === "switched" || attempt >= CHANNEL_SYNC_MAX_ATTEMPTS) {
      state.pendingChannel = null;
      return;
    }

    setTimeout(() => {
      void synchronisePendingChannel(attempt + 1);
    }, CHANNEL_SYNC_RETRY_MS);
  } catch (error) {
    if (attempt >= CHANNEL_SYNC_MAX_ATTEMPTS) {
      console.error("Unable to switch channel in chat webview:", error);
      state.pendingChannel = null;
      return;
    }

    // The webview can still be navigating when deep-link/focus events land.
    // Retry instead of dropping the pending channel on the first transient error.
    setTimeout(() => {
      void synchronisePendingChannel(attempt + 1);
    }, CHANNEL_SYNC_RETRY_MS);
  }
}

function handleDeepLink(input) {
  // C-4 fix: accept both raw URL strings and pre-parsed { type, value } objects
  // from deep-links.js
  let target;
  if (typeof input === "object" && input !== null && input.type) {
    // Pre-parsed object from deep-links.js: { type: 'channel'|'agent'|'port', value }
    if (input.type === "port") {
      target = { tab: "ports", channel: null };
    } else if (input.type === "channel") {
      target = { tab: "chat", channel: String(input.value) };
    } else if (input.type === "agent") {
      target = { tab: "chat", channel: null };
    } else {
      target = { tab: "chat", channel: null };
    }
  } else {
    // Raw URL string
    target = parseDeepLink(input);
  }

  if (!target) {
    return;
  }

  activateTab(target.tab);

  if (target.channel) {
    state.pendingChannel = target.channel;
    void synchronisePendingChannel();
  }
}

function bindEvents() {
  for (const button of elements.tabButtons) {
    button.addEventListener("click", () => {
      activateTab(button.dataset.tab);
    });
  }

  for (const button of elements.popOutButtons) {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      window.electronAPI?.requestPopOut?.(button.dataset.popout);
    });
  }

  elements.chatWebview.addEventListener("dom-ready", () => {
    state.webviewReady = true;
    void synchronisePendingChannel();
  });

  elements.browserPanePopout.addEventListener("click", () => {
    const result = window.BrowserPaneState.popoutBrowserPane(state.browserPane);
    state.browserPane = result.state;
    renderBrowserPane();
    if (result.effect) {
      void runBrowserPaneEffect(result.effect);
    }
  });

  elements.browserPaneClose.addEventListener("click", () => {
    state.browserPane = window.BrowserPaneState.closeBrowserPane(
      state.browserPane,
    );
    renderBrowserPane();
  });

  // H-2 fix: bridge webview ipc-message to main process for notifications
  elements.chatWebview.addEventListener("ipc-message", (event) => {
    if (event.channel === "send-notification") {
      window.electronAPI?.sendNotification?.(event.args[0]);
    } else if (event.channel === "desktop-command") {
      void handleDesktopCommand(event.args[0]);
    }
  });

  // H-3 fix: listen for pop-out-requested and other notification events
  window.electronAPI?.onNotification?.((data) => {
    if (data?.type === "pop-out-requested") {
      window.electronAPI?.requestPopOut?.(data.view);
    }
  });

  window.electronAPI?.onPortData?.((data) => {
    state.portRows = normalisePortRows(data);
    renderPorts();
  });

  window.electronAPI?.onDeepLink?.((url) => {
    handleDeepLink(url);
  });

  window.electronAPI?.onFocusChannel?.((channel) => {
    activateTab("chat");
    if (channel) {
      state.pendingChannel = channel;
      void synchronisePendingChannel();
    }
  });
}

function init() {
  configureWebview();
  bindEvents();
  activateTab("chat");
  renderBrowserPane();
  renderPorts();
}

init();
