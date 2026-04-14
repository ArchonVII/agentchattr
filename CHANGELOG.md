# Changelog

## 2026-04-14

### Added

- Multi-Layout Terminal View: Introduced dynamic Tabs, Grid, and Floating layout modes for concurrent terminal sessions.
- Floating Window Manager: Implemented draggable, resizable, and overlapping terminal windows with intelligent stacking (z-index) and focus management.
- Command Arsenal Sidebar: Added a collapsible right-hand sidebar for quick-injecting CLI skills and categorized project commands.
- Terminal Macro Bar: Per-instance toolbar for user-defined command macros (e.g., Git Status, NPM Start) with color coding.
- Theming Engine: Integrated on-the-fly theme switching for terminal instances, including "Cyberpunk", "Matrix", and "Dracula" presets.
- Quick Launch Bar: Added a compact workflow bar for saved repository shortcuts and one-click agent launching (Claude, Codex, Gemini).
- Permissions Control: "Skip Permissions" toggle in Quick Launch bar to automatically route agents through elevation/bypass scripts.
- Terminal-to-Agent Bridge: "Explain Output" button captures terminal context and sends it to the chat agent for instant analysis or troubleshooting.
- Session Metadata: Real-time PID display in the terminal toolbar for each session.
- UI Enhancements: Professionally styled terminal instance wrappers with active highlighting and optimized font settings (13px).
- Terminal process scanning: detects external terminal sessions (pwsh, powershell, cmd, bash, wsl, git-bash) via PowerShell WMI with Windows Terminal tab enrichment.
- Collapsible "Terminals" section in the presence panel sidebar showing detected terminal sessions with status dots, shell type labels, PID, and relative age.
- Embedded interactive terminals via xterm.js + node-pty in a new Terminals tab, with unlimited concurrent sessions, shell picker dropdown, tab rename, and pop-out support.
- Terminal lifecycle management: exited banner with restart/close, deduplication between embedded and external terminals.
- Presence panel click-through: clicking an embedded terminal in the sidebar focuses it in the Terminals tab.

## 2026-04-13

### Added

- Two-column lattice layout on the Ports page: left pane shows all listening ports, right pane shows only user-launched ports with enriched metadata.
- Port metadata enrichment via batched PowerShell queries: command line, parent process, session type, and description per PID, with aggressive caching.
- User vs system port classification based on session type and parent process lineage.
- Command-line pattern matching for common dev tools (Vite, Next.js, Django, Flask, etc.) to derive human-readable descriptions.
- Column sorting with clickable headers and asc/desc toggle indicators.
- Text search filter across all port columns, agent dropdown filter, and hide-system checkbox.
- Timestamps showing when each port was first seen (HH:MM:SS).
- Browse button per port row to open http://localhost:<port> in the Electron browser window.
- Chat-bubble SVG tray icon with improved fallback icon.

### Changed

- Closing the Electron window now quits the app instead of hiding to the system tray.

### Fixed

- Tray icon was invisible (no icon.png existed; fallback was a 16x16 plain square).

## 2026-04-12

### Added

- Added Electron browser controls that agents can trigger through MCP, with a docked in-app pane and a pop-out browser window mode.
- Added Electron QA coverage for the browser pane state, browser window launcher, desktop command bridge, notifications, and tray behavior.
- Added release-status docs for the desktop shell and launcher follow-up state.

### Changed

- Hardened launcher custom-agent stop/delete cleanup and extended launcher smoke coverage around explicit lifecycle cleanup.
- Updated the desktop shell docs and status tracking to reflect the recorded Windows QA gate and current release posture.
