import React, { useState, useEffect, useCallback } from "react";

// ---------------------------------------------------------------------------
// Category metadata
// ---------------------------------------------------------------------------

const CATEGORIES = [
  { id: "error", label: "Errors", colour: "#ff6b6b" },
  { id: "completion", label: "Completions", colour: "#4ade80" },
  { id: "file_reference", label: "File References", colour: "#60a5fa" },
  { id: "progress", label: "Progress", colour: "#fbbf24" },
];

// ---------------------------------------------------------------------------
// Styles (inline — no CSS-in-JS dep needed)
// ---------------------------------------------------------------------------

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 9998,
    background: "transparent",
  },
  panel: {
    position: "fixed",
    top: 0,
    right: 0,
    width: "340px",
    height: "100%",
    background: "#1a1a2e",
    borderLeft: "1px solid #2a2a3a",
    zIndex: 9999,
    display: "flex",
    flexDirection: "column",
    boxShadow: "-4px 0 20px rgba(0,0,0,0.4)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    borderBottom: "1px solid #2a2a3a",
    background: "#171726",
  },
  title: {
    fontSize: "13px",
    fontWeight: 700,
    color: "#e0e0e0",
    margin: 0,
  },
  closeBtn: {
    background: "transparent",
    border: "none",
    color: "#888",
    fontSize: "18px",
    cursor: "pointer",
    padding: "4px",
  },
  body: {
    flex: 1,
    overflowY: "auto",
    padding: "16px",
  },
  section: {
    marginBottom: "20px",
  },
  sectionTitle: {
    fontSize: "11px",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "#a7a7b7",
    marginBottom: "8px",
  },
  ruleRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "6px 0",
    borderBottom: "1px solid #222238",
  },
  toggle: {
    cursor: "pointer",
    accentColor: "#da7756",
  },
  ruleName: {
    flex: 1,
    fontSize: "12px",
    color: "#e0e0e0",
  },
  badge: (colour) => ({
    fontSize: "10px",
    padding: "1px 6px",
    borderRadius: "3px",
    background: colour + "22",
    color: colour,
    fontWeight: 600,
  }),
  customSection: {
    marginTop: "16px",
  },
  input: {
    width: "100%",
    padding: "6px 10px",
    border: "1px solid #2a2a3a",
    borderRadius: "4px",
    background: "#12121e",
    color: "#e0e0e0",
    fontSize: "12px",
    fontFamily: "Consolas, monospace",
    boxSizing: "border-box",
    outline: "none",
  },
  addBtn: {
    marginTop: "8px",
    padding: "6px 12px",
    border: "1px solid #2a2a3a",
    borderRadius: "4px",
    background: "#1f1f31",
    color: "#e0e0e0",
    fontSize: "12px",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  deleteBtn: {
    background: "transparent",
    border: "none",
    color: "#666",
    cursor: "pointer",
    fontSize: "14px",
    padding: "2px 4px",
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WatcherSettingsPanel() {
  const [open, setOpen] = useState(false);
  const [rules, setRules] = useState([]);
  const [newPattern, setNewPattern] = useState("");
  const [newName, setNewName] = useState("");

  // Load rules on open
  useEffect(() => {
    if (!open) return;
    window.electronAPI
      ?.getWatcherConfig()
      .then((r) => setRules(r || []))
      .catch(() => {});
  }, [open]);

  // Listen for external config updates
  useEffect(() => {
    const handler = (data) => setRules(data || []);
    window.electronAPI?.onWatcherConfigUpdated(handler);
  }, []);

  // Listen for toggle event from vanilla JS
  useEffect(() => {
    const handler = () => setOpen((prev) => !prev);
    window.addEventListener("bridge:toggle-settings", handler);
    return () => window.removeEventListener("bridge:toggle-settings", handler);
  }, []);

  const saveRules = useCallback((updated) => {
    setRules(updated);
    window.electronAPI?.setWatcherConfig(updated);
  }, []);

  const toggleRule = useCallback(
    (ruleId) => {
      const updated = rules.map((r) =>
        r.id === ruleId ? { ...r, enabled: !r.enabled } : r,
      );
      saveRules(updated);
    },
    [rules, saveRules],
  );

  const deleteRule = useCallback(
    (ruleId) => {
      const updated = rules.filter((r) => r.id !== ruleId);
      saveRules(updated);
    },
    [rules, saveRules],
  );

  const addCustomRule = useCallback(() => {
    const pattern = newPattern.trim();
    const name = newName.trim() || `Custom: ${pattern.slice(0, 30)}`;
    if (!pattern) return;

    // Validate regex
    try {
      new RegExp(pattern);
    } catch {
      return;
    }

    const rule = {
      id: `custom-${Date.now()}`,
      name,
      category: "error",
      pattern,
      enabled: true,
      priority: 5,
    };
    saveRules([...rules, rule]);
    setNewPattern("");
    setNewName("");
  }, [rules, newPattern, newName, saveRules]);

  if (!open) return null;

  const builtinRules = rules.filter((r) => r.id.startsWith("builtin-"));
  const customRules = rules.filter((r) => !r.id.startsWith("builtin-"));

  const getCategoryColour = (cat) =>
    CATEGORIES.find((c) => c.id === cat)?.colour || "#888";

  return (
    <>
      <div style={styles.overlay} onClick={() => setOpen(false)} />
      <div style={styles.panel}>
        <div style={styles.header}>
          <h3 style={styles.title}>Watcher Settings</h3>
          <button
            style={styles.closeBtn}
            onClick={() => setOpen(false)}
            aria-label="Close settings"
          >
            ×
          </button>
        </div>

        <div style={styles.body}>
          {/* Built-in rules by category */}
          {CATEGORIES.map((cat) => {
            const catRules = builtinRules.filter((r) => r.category === cat.id);
            if (catRules.length === 0) return null;
            return (
              <div key={cat.id} style={styles.section}>
                <div style={styles.sectionTitle}>{cat.label}</div>
                {catRules.map((rule) => (
                  <div key={rule.id} style={styles.ruleRow}>
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={() => toggleRule(rule.id)}
                      style={styles.toggle}
                    />
                    <span style={styles.ruleName}>{rule.name}</span>
                    <span style={styles.badge(cat.colour)}>{cat.id}</span>
                  </div>
                ))}
              </div>
            );
          })}

          {/* Custom rules */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Custom Rules</div>
            {customRules.map((rule) => (
              <div key={rule.id} style={styles.ruleRow}>
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={() => toggleRule(rule.id)}
                  style={styles.toggle}
                />
                <span style={styles.ruleName}>{rule.name}</span>
                <span style={styles.badge(getCategoryColour(rule.category))}>
                  {rule.category}
                </span>
                <button
                  style={styles.deleteBtn}
                  onClick={() => deleteRule(rule.id)}
                  title="Delete rule"
                >
                  ×
                </button>
              </div>
            ))}

            {customRules.length === 0 && (
              <div
                style={{ fontSize: "12px", color: "#666", padding: "4px 0" }}
              >
                No custom rules yet
              </div>
            )}

            <div style={styles.customSection}>
              <input
                style={{ ...styles.input, marginBottom: "6px" }}
                placeholder="Rule name (optional)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <input
                style={styles.input}
                placeholder="Regex pattern (e.g. DEPLOY:.*)"
                value={newPattern}
                onChange={(e) => setNewPattern(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCustomRule()}
              />
              <button style={styles.addBtn} onClick={addCustomRule}>
                + Add Rule
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
