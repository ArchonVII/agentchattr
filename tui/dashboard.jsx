#!/usr/bin/env node

/**
 * tui/dashboard.jsx — Ink TUI dashboard for agentchattr.
 *
 * Multi-panel terminal UI showing server status, logs, and agent activity.
 * Connects to the running agentchattr server via HTTP.
 *
 * Usage: npx tsx tui/dashboard.jsx [--theme <id>]
 *
 * Source: CSS-to-ANSI Translation Layer spec, Section 6.2.
 */

import React, { useState, useEffect } from "react";
import { render, Box, Text, Newline } from "ink";
import Spinner from "ink-spinner";
import { ThemeProvider, useTheme } from "./theme.js";
import MacWindow from "./components/MacWindow.jsx";

// ---------------------------------------------------------------------------
// Parse CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const themeIdx = args.indexOf("--theme");
const cliTheme =
  themeIdx !== -1 && args[themeIdx + 1]
    ? args[themeIdx + 1]
    : process.env.AGENTCHATTR_THEME || null;

// Server base URL.
// Source: run.py default port.
const SERVER_PORT = process.env.AGENTCHATTR_PORT || 39777;
const BASE_URL = `http://127.0.0.1:${SERVER_PORT}`;

// Auto-detect theme from the running server if not specified via CLI/env.
async function resolveTheme() {
  if (cliTheme) return cliTheme;
  try {
    const resp = await fetch(`${BASE_URL}/api/theme`);
    if (resp.ok) {
      const data = await resp.json();
      return data.id || "default";
    }
  } catch {
    // Server not reachable — fall back to default
  }
  return "default";
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function fetchJson(urlPath) {
  try {
    const resp = await fetch(`${BASE_URL}${urlPath}`);
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function StatusPanel() {
  const { chalk: c } = useTheme();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const poll = async () => {
      const data = await fetchJson("/api/theme");
      if (data) {
        setStatus(data);
        setLoading(false);
      }
    };
    poll();
    // Poll every 10 seconds. Source: lightweight — just theme metadata.
    const timer = setInterval(poll, 10000);
    return () => clearInterval(timer);
  }, []);

  return (
    <MacWindow title="STATUS">
      {loading ? (
        <Text>
          <Spinner type="dots" /> Connecting to server...
        </Text>
      ) : (
        <Box flexDirection="column">
          <Text>
            {c.muted("Theme:")} {c.accent(status?.id || "unknown")}
          </Text>
          <Text>
            {c.muted("Server:")} {c.success(`http://127.0.0.1:${SERVER_PORT}`)}
          </Text>
        </Box>
      )}
    </MacWindow>
  );
}

function AgentPanel() {
  const { chalk: c } = useTheme();
  const [agents, setAgents] = useState([]);

  useEffect(() => {
    const poll = async () => {
      const data = await fetchJson("/api/agents");
      if (data && Array.isArray(data)) {
        setAgents(data);
      }
    };
    poll();
    // Poll every 5 seconds. Source: agent list updates are infrequent.
    const timer = setInterval(poll, 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <MacWindow title="AGENTS">
      {agents.length === 0 ? (
        <Text>{c.muted("No agents connected")}</Text>
      ) : (
        <Box flexDirection="column">
          {agents.map((agent, i) => (
            <Text key={i}>
              {c.accent(agent.name || agent)} {c.muted(agent.status || "")}
            </Text>
          ))}
        </Box>
      )}
    </MacWindow>
  );
}

function LogPanel() {
  const { chalk: c } = useTheme();

  return (
    <MacWindow title="LOGS">
      <Text>{c.muted("Log streaming — coming in v2")}</Text>
      <Text>{c.muted("Use the Electron terminal pane for live logs")}</Text>
    </MacWindow>
  );
}

function Dashboard() {
  const { chalk: c, palette } = useTheme();

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold>
          {c.accent("agentchattr")} {c.muted("TUI Dashboard")}
          {palette.name ? c.muted(` — ${palette.name}`) : ""}
        </Text>
      </Box>
      <StatusPanel />
      <Newline />
      <AgentPanel />
      <Newline />
      <LogPanel />
      <Newline />
      <Text>{c.muted("Press Ctrl+C to exit")}</Text>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

resolveTheme().then((themeId) => {
  render(
    <ThemeProvider themeId={themeId}>
      <Dashboard />
    </ThemeProvider>,
  );
});
