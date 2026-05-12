# Project Status — agentchattr

Last updated: 2026-05-12 by Manager

## Active Workstreams

### Web UI Decomposition

- **Status:** Planned
- **Owner:** Unassigned
- **Plan:** `docs/superpowers/plans/2026-04-17-web-ui-decomposition-plan.md`
- **Progress:** 0/5 phases complete. Audit landed (PR #16, `07ece5b`). `static/chat.js` remains the dominant maintenance hotspot; `core.js`, `store.js`, `chat-theme.js`, `repository.js` to stay as raw JS.
- **Blocked by:** Nothing
- **Next:** Phase 1 — create `static/app-shell.js`, inventory `window.*` exports in `chat.js`, and remove the first tranche of inline handlers from `static/index.html`.
- **Notes:** Goal is controlled decomposition, not a rewrite. Component adoption deferred until module/state boundaries are stable.

### CSS-to-ANSI Translation Layer

- **Status:** Planned
- **Owner:** Unassigned
- **Plan:** `docs/superpowers/plans/2026-04-15-css-to-ansi-translation-layer.md`
- **Progress:** 0/11 tasks complete. Plan tracked on main `8a9edd7` after its original branch was pruned 2026-05-12.
- **Blocked by:** Nothing
- **Next:** Task 1 — build `scripts/generate-theme-snapshot.js` to emit `data/theme_snapshot.json` from the existing theme registry + CSS adapters + terminal themes.
- **Notes:** Goal is theming Python (Rich) and Node (Ink/Chalk) terminal output from the same source as the Electron app themes. Touches `run.py`, `app.py`, `electron/main.js`, and adds a new `tui/` directory.

### Desktop Shell QA & Signoff

- **Status:** Maintenance
- **Owner:** Unassigned
- **Plan:** `docs/superpowers/qa/desktop-shell-checklist.md`
- **Progress:** Full automated gate passed (35 unit tests, 3 smoke suites). Terminal smoke test added 2026-04-14.
- **Blocked by:** Nothing
- **Next:** Optional native tray/toast spot checks before release. See `docs/superpowers/qa/release-readiness.md`.
- **Notes:** Port `8300` must be free before launching Electron. Renderer scripts bundled with esbuild (decision 2026-04-14).

### Launcher Lifecycle Stabilisation

- **Status:** Maintenance
- **Owner:** Unassigned
- **Plan:** `docs/archive/shipped/2026-04-05-agent-launcher-panel.md`
- **Progress:** Implementation landed; duplicate launches, restore-banner behaviour, explicit custom-agent stop/delete, desktop browser routing all covered.
- **Blocked by:** Nothing
- **Next:** Keep launcher and desktop browser smoke/unit coverage green. Track follow-up in `docs/superpowers/qa/known-issues-next-milestones.md`.

### Repo Workflow & Documentation Hygiene

- **Status:** Maintenance
- **Owner:** Unassigned
- **Plan:** None
- **Progress:** Fork workflow documented. Worktree + branch cleanup 2026-05-12 (3 worktrees, 6 local branches, 3 remote branches pruned — all already merged).
- **Blocked by:** Nothing
- **Next:** Keep this status file current after QA runs or release-adjacent changes.
- **Notes:** `origin/main` is authoritative. `upstream` is fetch-only reference.

## Backlog (prioritised)

1. Visually verify the two-column ports lattice layout with real dev servers running.
2. Decide whether Windows smoke coverage should remain local-only or move into CI.
3. Add browser status/readback primitives if agents need more than open/dock/pop-out URL control.
4. Consider port history timeline view (tracked in memory but not rendered).
5. Theme settings panel with colour override editor and custom theme save/export.
6. Additional theme adapters (XP.css, TuiCss, Arwes/cyberpunk).
7. Persist Quick Launch folders and custom macros to `electron-store` (currently in-memory).
8. Deep terminal-to-chat integration (piping terminal output to chat channels) — future phase.
9. Saved terminal profiles (custom working directories, environment variables) — future.

## Recently Completed

- [2026-05-12] Repo cleanup — removed 3 stale worktrees and 6 merged branches — `8a9edd7`
- [2026-05-12] Tracked CSS-to-ANSI plan on main — `8a9edd7`
- [2026-04-?] Chat image-path previews and agent completions — `c72d31b`
- [2026-04-?] Web UI decomposition plan — `07ece5b` (PR #16)
- [2026-04-?] Project sidebar and desktop launch polish — `552b9bd`
- [2026-04-?] Terminal launch and presence card streamlining — `6ac10ac`
- [2026-04-?] Browser theme adapters adapted across surfaces — `0809263` (PR #15)
- [2026-04-?] Browser theme hookups finished — `94354a8` (PR #14)
- [2026-04-?] MCP visual verification and port management — `ca06f9a`
- [2026-04-?] Repository workspace view — `48f1b02`
- [2026-04-14] Terminal scanner unit tests + Electron smoke test — `1844cab`
- [2026-04-14] Terminal scanning and embedded terminals — `8b7c034` (PR #8)
- [2026-04-14] Ports dashboard two-column layout — `6f4cc02` (PR #7)
- [2026-04-12] Collapsible room and roster sidebars — `aa87999` (PR #5)
- [2026-04-12] Electron browser pane and desktop QA follow-up — `2ef1c3f` (PR #6)
- [2026-04-12] Fork-only workflow documented — `54fa3b9`
- [2026-04-12] Desktop smoke coverage and Windows QA checklist — `3895be7`

## Parking Lot

Items discussed but not yet planned:

- Decide whether a separate native-desktop release checklist is still needed beyond `docs/superpowers/qa/release-readiness.md` and the existing QA gate.
- Reduce or archive superseded implementation plans once their follow-up QA is fully recorded.
- TUI dashboard v2 follow-ups (live log streaming, scanline rendering, baud-rate effect) — captured in `TODO.md`, will fold into the CSS-to-ANSI plan once base tasks land.

## Decision Log

| Date       | Decision                                                                                                      | Context                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 2026-05-12 | Adopt the CSS-to-ANSI plan as a tracked workstream on main instead of resurrecting its branch.                | Branch was already merged/stale; plan file was untracked since 2026-04-15.              |
| 2026-04-14 | Bundle renderer scripts with esbuild rather than enabling Node integration.                                   | Security: keeps context isolation intact. `terminals.js` was the first file to need it. |
| 2026-04-12 | Treat `origin/main` as the authoritative branch for this fork and keep `upstream` read-only.                  | Documented in `README.md` fork workflow policy.                                         |
| 2026-04-12 | Keep the Electron shell as a wrapper around the same local `run.py` server on port `8300`.                    | Documented in the Windows desktop shell section of `README.md`.                         |
| 2026-04-12 | Use an HttpOnly `session` cookie for browser auth; do not rely on a JS-readable token global.                 | Reflected in `app.py`, `static/chat.js`, and the reconciled memory note.                |
| 2026-04-12 | Route agent-triggered browser opens through Electron only, docked by default with an optional pop-out window. | Implemented in `mcp_bridge.py` plus the Electron renderer/browser window bridge.        |
