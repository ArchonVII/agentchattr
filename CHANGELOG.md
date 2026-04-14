# Changelog

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
