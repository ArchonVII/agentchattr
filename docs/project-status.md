# Project Status — agentchattr

Last updated: 2026-04-14 by Manager

## Active Workstreams

### Desktop Shell QA & Signoff

- **Status:** Active
- **Owner:** Unassigned
- **Plan:** `docs/superpowers/qa/desktop-shell-checklist.md`
- **Progress:** Full automated gate passed (35 unit tests, 3 smoke suites). Terminal smoke test added 2026-04-14 covering tab navigation, embedded terminal create/close, and preload API wiring.
- **Blocked by:** Nothing
- **Next:** Optional native tray/toast spot checks before release. See `docs/superpowers/qa/release-readiness.md`.
- **Notes:** Port `8300` must be free before launching Electron. The `terminals.js` renderer script requires bundling via esbuild (fixed `9fec225`).

### Launcher Lifecycle Stabilisation

- **Status:** Maintenance
- **Owner:** Unassigned
- **Plan:** `docs/archive/shipped/2026-04-05-agent-launcher-panel.md`
- **Progress:** Implementation landed; duplicate launches, restore-banner behaviour, explicit custom-agent stop/delete flow, and desktop browser routing are covered.
- **Blocked by:** Nothing
- **Next:** Keep the launcher and desktop browser smoke/unit coverage green.
- **Notes:** Effectively in maintenance mode. Track follow-up in `docs/superpowers/qa/known-issues-next-milestones.md`.

### Repo Workflow & Documentation Hygiene

- **Status:** Active
- **Owner:** Unassigned
- **Plan:** None
- **Progress:** Fork workflow documented. Stale `fix/security-hardening` branch cleaned up on 2026-04-14 (was already merged via PR #1).
- **Blocked by:** Nothing
- **Next:** Keep this status file current after QA runs or release-adjacent changes.
- **Notes:** `origin/main` is the authoritative branch. `upstream` is fetch-only reference.

## Backlog (prioritised)

1. Visually verify the two-column ports lattice layout with real dev servers running.
2. Decide whether Windows smoke coverage should remain local-only or move into CI.
3. Add browser status/readback primitives if agents need more than open/dock/pop-out URL control.
4. Consider port history timeline view (tracked in memory but not rendered).
5. Deep terminal-to-chat integration (piping terminal output to chat channels) — future phase.
6. Saved terminal profiles (custom working directories, environment variables) — future enhancement.

## Recently Completed

- [2026-04-14] Implemented Grid/Floating terminal layouts, Command Arsenal, and Quick Launch bar — `feat(terminals)`
- [2026-04-14] Fixed terminals.js bundling for context-isolated renderer — `9fec225`
- [2026-04-14] Added terminal scanner unit tests (15) and Electron smoke test — `1844cab`
- [2026-04-14] Cleaned up stale `fix/security-hardening` branch (local + remote)
- [2026-04-14] Terminal scanning and embedded terminals — `8b7c034` (PR #8)
- [2026-04-14] Enhanced ports dashboard with two-column layout — `6f4cc02` (PR #7)
- [2026-04-12] Collapsible room and roster sidebars — `aa87999` (PR #5)
- [2026-04-12] Electron browser pane and desktop QA follow-up — `2ef1c3f` (PR #6)
- [2026-04-12] Documented the fork-only workflow in `README.md` — `54fa3b9`
- [2026-04-12] Desktop smoke coverage and Windows QA checklist — `3895be7`
- [2026-04-05] Landed the launcher implementation and API/test scaffolding — `93d32b6`..`6589d2b`

## Parking Lot

Items discussed but not yet planned:

- Decide whether a separate native-desktop release checklist is still needed beyond `docs/superpowers/qa/release-readiness.md` and the existing QA gate.
- Reduce or archive superseded implementation plans once their follow-up QA is fully recorded.

## Decision Log

| Date       | Decision                                                                                                      | Context                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 2026-04-14 | Bundle renderer scripts with esbuild rather than enabling Node integration.                                   | Security: keeps context isolation intact. `terminals.js` was the first file to need it. |
| 2026-04-12 | Treat `origin/main` as the authoritative branch for this fork and keep `upstream` read-only.                  | Documented in `README.md` fork workflow policy.                                         |
| 2026-04-12 | Keep the Electron shell as a wrapper around the same local `run.py` server on port `8300`.                    | Documented in the Windows desktop shell section of `README.md`.                         |
| 2026-04-12 | Use an HttpOnly `session` cookie for browser auth; do not rely on a JS-readable token global.                 | Reflected in `app.py`, `static/chat.js`, and the reconciled memory note.                |
| 2026-04-12 | Route agent-triggered browser opens through Electron only, docked by default with an optional pop-out window. | Implemented in `mcp_bridge.py` plus the Electron renderer/browser window bridge.        |
