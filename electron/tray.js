const fs = require("fs");
const path = require("path");
const { Tray, Menu, nativeImage, app } = require("electron");

const PNG_ICON_PATH = path.join(__dirname, "assets", "icon.png");
const SVG_ICON_PATH = path.join(__dirname, "assets", "icon.svg");
const FALLBACK_COLOUR = "#da7756";

let trayInstance = null;
let trackedWindow = null;

function createSvgDataUrl(svgMarkup) {
  return `data:image/svg+xml;base64,${Buffer.from(svgMarkup).toString("base64")}`;
}

function createChatBubbleIcon() {
  // 32x32 chat-bubble icon matching the app's brand colour
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="6" fill="${FALLBACK_COLOUR}" />
      <path d="M8 9h16c1.5 0 3 1.5 3 3v8c0 1.5-1.5 3-3 3h-4l-4 4-4-4H8c-1.5 0-3-1.5-3-3v-8c0-1.5 1.5-3 3-3z" fill="#fff" opacity="0.95"/>
      <circle cx="12" cy="16" r="1.5" fill="${FALLBACK_COLOUR}"/>
      <circle cx="16" cy="16" r="1.5" fill="${FALLBACK_COLOUR}"/>
      <circle cx="20" cy="16" r="1.5" fill="${FALLBACK_COLOUR}"/>
    </svg>
  `;

  return nativeImage.createFromDataURL(createSvgDataUrl(svg));
}

function loadTrayIcon() {
  // Prefer PNG if it exists
  if (fs.existsSync(PNG_ICON_PATH)) {
    const icon = nativeImage.createFromPath(PNG_ICON_PATH);

    if (!icon.isEmpty()) {
      return icon;
    }
  }

  // Try SVG via data-URL
  if (fs.existsSync(SVG_ICON_PATH)) {
    try {
      const svgContent = fs.readFileSync(SVG_ICON_PATH, "utf8");
      const icon = nativeImage.createFromDataURL(createSvgDataUrl(svgContent));

      if (icon && !(typeof icon.isEmpty === "function" && icon.isEmpty())) {
        return icon;
      }
    } catch {
      // Fall through to chat-bubble fallback
    }
  }

  return createChatBubbleIcon();
}

function createBadgeImage(count) {
  const displayCount = count > 99 ? "99+" : String(count);
  const fontSize = displayCount.length > 2 ? 11 : 14;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="15" fill="${FALLBACK_COLOUR}" />
      <text
        x="16"
        y="16"
        font-family="Segoe UI, sans-serif"
        font-size="${fontSize}"
        font-weight="700"
        dominant-baseline="central"
        text-anchor="middle"
        fill="#ffffff"
      >${displayCount}</text>
    </svg>
  `;

  return nativeImage.createFromDataURL(createSvgDataUrl(svg));
}

function toggleWindowVisibility(mainWindow) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (mainWindow.isVisible()) {
    mainWindow.hide();
    return;
  }

  mainWindow.show();
  mainWindow.focus();
}

function createTray(mainWindow) {
  trackedWindow = mainWindow ?? null;

  if (trayInstance) {
    trayInstance.destroy();
  }

  trayInstance = new Tray(loadTrayIcon());
  trayInstance.setToolTip("agentchattr");
  trayInstance.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Show/Hide",
        click: () => toggleWindowVisibility(trackedWindow),
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => app.quit(),
      },
    ]),
  );

  trayInstance.on("double-click", () => {
    if (!trackedWindow || trackedWindow.isDestroyed()) {
      return;
    }

    trackedWindow.show();
    trackedWindow.focus();
  });

  return trayInstance;
}

function setBadge(count) {
  if (!trackedWindow || trackedWindow.isDestroyed()) {
    return;
  }

  if (count > 0) {
    trackedWindow.setOverlayIcon(
      createBadgeImage(count),
      `${count} unread notification${count === 1 ? "" : "s"}`,
    );
    return;
  }

  trackedWindow.setOverlayIcon(null, "");
}

module.exports = {
  createTray,
  setBadge,
};
