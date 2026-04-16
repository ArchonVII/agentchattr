function toFiniteNumber(value) {
  return Number.isFinite(value) ? value : null;
}

function normaliseDisplayArea(display) {
  if (!display || typeof display !== "object") return null;
  const area =
    display.workArea && typeof display.workArea === "object"
      ? display.workArea
      : display.bounds;
  if (!area || typeof area !== "object") return null;

  const x = toFiniteNumber(area.x);
  const y = toFiniteNumber(area.y);
  const width = toFiniteNumber(area.width);
  const height = toFiniteNumber(area.height);

  if (x === null || y === null || width === null || height === null) {
    return null;
  }
  if (width <= 0 || height <= 0) {
    return null;
  }

  return { x, y, width, height };
}

function intersects(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function isVisibleOnAnyDisplay(bounds, displays) {
  if (!bounds || typeof bounds !== "object") return false;
  const x = toFiniteNumber(bounds.x);
  const y = toFiniteNumber(bounds.y);
  const width = toFiniteNumber(bounds.width);
  const height = toFiniteNumber(bounds.height);

  if (x === null || y === null || width === null || height === null) {
    return false;
  }
  if (width <= 0 || height <= 0) {
    return false;
  }

  const rect = { x, y, width, height };
  return displays
    .map(normaliseDisplayArea)
    .filter(Boolean)
    .some((displayArea) => intersects(rect, displayArea));
}

function centreWithinDisplay(displayArea, fallback) {
  const width = Math.min(fallback.width, displayArea.width);
  const height = Math.min(fallback.height, displayArea.height);

  return {
    width,
    height,
    x: displayArea.x + Math.max(0, Math.floor((displayArea.width - width) / 2)),
    y:
      displayArea.y + Math.max(0, Math.floor((displayArea.height - height) / 2)),
  };
}

function normaliseWindowBounds(savedBounds, displays, fallback = { width: 1200, height: 800 }) {
  if (isVisibleOnAnyDisplay(savedBounds, displays)) {
    return {
      width: savedBounds.width,
      height: savedBounds.height,
      x: savedBounds.x,
      y: savedBounds.y,
    };
  }

  const displayArea =
    displays.map(normaliseDisplayArea).filter(Boolean)[0] || {
      x: 0,
      y: 0,
      width: fallback.width,
      height: fallback.height,
    };

  const preferredSize =
    savedBounds &&
    Number.isFinite(savedBounds.width) &&
    savedBounds.width > 0 &&
    Number.isFinite(savedBounds.height) &&
    savedBounds.height > 0
      ? { width: savedBounds.width, height: savedBounds.height }
      : fallback;

  return centreWithinDisplay(displayArea, preferredSize);
}

module.exports = {
  isVisibleOnAnyDisplay,
  normaliseWindowBounds,
};
