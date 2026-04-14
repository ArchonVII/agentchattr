import React, { useState, useCallback, useEffect } from "react";

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  btn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "4px 8px",
    background: "transparent",
    border: "1px solid #2a2a3a",
    borderRadius: "4px",
    color: "#888",
    fontSize: "11px",
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "all 0.2s",
    gap: "4px",
  },
  btnHover: {
    background: "rgba(218, 119, 86, 0.1)",
    borderColor: "#da7756",
    color: "#fff2eb",
  },
  flash: {
    background: "rgba(74, 222, 128, 0.2)",
    borderColor: "#4ade80",
    color: "#4ade80",
  },
};

// Camera SVG icon
const CameraIcon = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 16 16"
    fill="currentColor"
    style={{ flexShrink: 0 }}
  >
    <path d="M10.5 8.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z" />
    <path d="M2 4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-1.172a2 2 0 0 1-1.414-.586l-.828-.828A2 2 0 0 0 9.172 2H6.828a2 2 0 0 0-1.414.586l-.828.828A2 2 0 0 1 3.172 4H2zm.5 2a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1zm9 2.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0z" />
  </svg>
);

// ---------------------------------------------------------------------------
// Component — renders one button per terminal, triggered by vanilla JS
// ---------------------------------------------------------------------------

export function SnapshotToolbarButton() {
  const [terminals, setTerminals] = useState([]);
  const [flashId, setFlashId] = useState(null);
  const [hoverId, setHoverId] = useState(null);

  // Listen for terminal lifecycle events from bridge-ui.js
  useEffect(() => {
    const onCreated = (e) => {
      const { id, name, agentName } = e.detail || {};
      if (id) {
        setTerminals((prev) => [
          ...prev.filter((t) => t.id !== id),
          { id, name, agentName },
        ]);
      }
    };
    const onDestroyed = (e) => {
      const { id } = e.detail || {};
      if (id) {
        setTerminals((prev) => prev.filter((t) => t.id !== id));
      }
    };
    window.addEventListener("bridge:terminal-created", onCreated);
    window.addEventListener("bridge:terminal-destroyed", onDestroyed);
    return () => {
      window.removeEventListener("bridge:terminal-created", onCreated);
      window.removeEventListener("bridge:terminal-destroyed", onDestroyed);
    };
  }, []);

  const sendSnapshot = useCallback(async (terminalId) => {
    try {
      const lines = await window.electronAPI?.getTerminalSnapshot(
        terminalId,
        50,
      );
      if (lines && lines.length > 0) {
        const text = "```\n" + lines.join("\n") + "\n```";
        window.electronAPI?.sendSnapshotToChat(terminalId, text, null);
        // Flash feedback
        setFlashId(terminalId);
        setTimeout(() => setFlashId(null), 800);
      }
    } catch (err) {
      console.warn("Snapshot failed:", err);
    }
  }, []);

  // This component is mounted globally; individual snapshot buttons
  // are injected per-terminal via the bridge:snapshot-request event
  useEffect(() => {
    const handler = (e) => {
      const { terminalId } = e.detail || {};
      if (terminalId) sendSnapshot(terminalId);
    };
    window.addEventListener("bridge:snapshot-request", handler);
    return () => window.removeEventListener("bridge:snapshot-request", handler);
  }, [sendSnapshot]);

  // Render nothing — the actual buttons are injected by vanilla JS.
  // This component just handles the snapshot logic via events.
  return null;
}
