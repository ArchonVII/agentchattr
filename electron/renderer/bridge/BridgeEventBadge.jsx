import React, { useState, useEffect, useCallback, useRef } from "react";

// ---------------------------------------------------------------------------
// Category colours — must match WatcherSettingsPanel
// ---------------------------------------------------------------------------

const CATEGORY_COLOURS = {
  error: "#ff6b6b",
  completion: "#4ade80",
  file_reference: "#60a5fa",
  progress: "#fbbf24",
  snapshot: "#c084fc",
  system: "#888",
};

// Source: design spec Section 3 — auto-clear timeout for badges.
const AUTO_CLEAR_MS = 30000;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  container: {
    display: "flex",
    gap: "4px",
    alignItems: "center",
    marginLeft: "8px",
  },
  badge: (colour) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: "3px",
    padding: "1px 6px",
    borderRadius: "8px",
    background: colour + "22",
    color: colour,
    fontSize: "10px",
    fontWeight: 600,
    cursor: "pointer",
    border: "none",
    fontFamily: "inherit",
    transition: "opacity 0.3s",
  }),
  dot: (colour) => ({
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    background: colour,
    display: "inline-block",
  }),
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BridgeEventBadge() {
  // counts keyed by category
  const [counts, setCounts] = useState({});
  const clearTimerRef = useRef(null);

  // Listen for bridge events from main process
  useEffect(() => {
    const handler = (event) => {
      const cat = event.category || "system";
      setCounts((prev) => ({
        ...prev,
        [cat]: (prev[cat] || 0) + 1,
      }));

      // Reset auto-clear timer on each new event
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
      clearTimerRef.current = setTimeout(() => {
        setCounts({});
      }, AUTO_CLEAR_MS);
    };

    window.electronAPI?.onBridgeEvent(handler);

    return () => {
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    };
  }, []);

  // Also listen for custom events from vanilla JS
  useEffect(() => {
    const handler = (e) => {
      const { category } = e.detail || {};
      if (category) {
        setCounts((prev) => ({
          ...prev,
          [category]: (prev[category] || 0) + 1,
        }));
      }
    };
    window.addEventListener("bridge:event", handler);
    return () => window.removeEventListener("bridge:event", handler);
  }, []);

  const dismissCategory = useCallback((cat) => {
    setCounts((prev) => {
      const next = { ...prev };
      delete next[cat];
      return next;
    });
  }, []);

  const dismissAll = useCallback(() => {
    setCounts({});
  }, []);

  const entries = Object.entries(counts).filter(([, v]) => v > 0);
  if (entries.length === 0) return null;

  return (
    <div style={styles.container}>
      {entries.map(([cat, count]) => {
        const colour = CATEGORY_COLOURS[cat] || "#888";
        return (
          <button
            key={cat}
            style={styles.badge(colour)}
            onClick={() => dismissCategory(cat)}
            title={`${count} ${cat} event${count > 1 ? "s" : ""} — click to dismiss`}
          >
            <span style={styles.dot(colour)} />
            {count}
          </button>
        );
      })}
      {entries.length > 1 && (
        <button
          style={{
            ...styles.badge("#666"),
            fontSize: "9px",
          }}
          onClick={dismissAll}
          title="Dismiss all"
        >
          ×
        </button>
      )}
    </div>
  );
}
