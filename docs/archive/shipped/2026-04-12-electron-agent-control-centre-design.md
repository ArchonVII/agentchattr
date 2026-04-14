# Electron Agent Control Centre — Design Spec

**Date:** 2026-04-12
**Status:** Approved
**Plan:** `~/.claude/plans/warm-noodling-wreath.md`

## Purpose

Wrap the agentchattr Python server in an Electron desktop app that provides:
1. Native window with system tray, notifications, global shortcuts
2. Port/process monitoring dashboard showing all localhost listeners with agent attribution

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Framework | Electron | Ecosystem breadth, future expandability, no Rust toolchain |
| Location | `electron/` in this repo | Single clone, single branch, easy to keep in sync |
| Python discovery | Find existing `.venv/` | User already has venv from development |
| Title bar | Native Windows frame | Zero custom CSS, consistent with OS |
| Close behaviour | Ask with "remember" checkbox | Doesn't surprise users either way |
| Port scanning | `execFile('netstat', ['-ano'])` | Zero deps, safe (no shell injection), fast |

## Features

- **System tray** — minimise to tray, context menu, notification badge
- **Native notifications** — @mentions, job completions, agent crashes
- **Global shortcuts** — `Ctrl+Shift+A` to toggle window (configurable)
- **Native file dialogs** — OS picker for uploads, drag-and-drop
- **Deep links** — `agentchattr://channel/general`, `agentchattr://port/8300`
- **Multi-window** — pop out any tab into its own window
- **Port dashboard** — live table of listening ports, PID, process name, agent attribution, kill button, history ledger

## Architecture

Electron main process spawns Python server as child process, waits for "Uvicorn running on" stdout signal, then opens BrowserWindow with a tab shell. Chat tab loads `http://127.0.0.1:8300` via webview. Ports tab renders locally with data from a background netstat poller.

No changes to existing Python server files. The Electron shell is purely additive.

## Not Included

- Auto-update (not needed for local-dev tool)
- Cross-platform (Windows only for now)
- Extending agent registration API to include ports (future)
