# Project Status — agentchattr
Last updated: 2026-04-12 by Manager

## Active Workstreams

### Desktop Shell QA & Signoff
- **Status:** Active
- **Owner:** Unassigned
- **Plan:** `docs/superpowers/qa/desktop-shell-checklist.md`
- **Progress:** Full automated gate passed, including tray/notification/deep-link logic and explicit custom-agent stop/delete coverage
- **Blocked by:** Nothing
- **Next:** Keep the automated gate green; optional native-desktop spot checks can happen before a release. See `docs/superpowers/qa/release-readiness.md`.
- **Notes:** Port `8300` must be free before launching Electron, the Electron shell should own the embedded `run.py` lifecycle, and a startup retry race in `electron/renderer/renderer.js` was fixed during the 2026-04-12 QA run.

### Launcher Lifecycle Stabilization
- **Status:** Active
- **Owner:** Unassigned
- **Plan:** `docs/superpowers/plans/2026-04-05-agent-launcher-panel.md`
- **Progress:** Implementation landed; duplicate launches, restore-banner behavior, and explicit custom-agent stop/delete flow are smoke-covered
- **Blocked by:** Nothing
- **Next:** Archive or shrink the implementation plan now that validation is recorded. Track remaining follow-up in `docs/superpowers/qa/known-issues-next-milestones.md`.
- **Notes:** The original launcher implementation is in the repo; this workstream is effectively in maintenance mode now.

### Repo Workflow & Documentation Hygiene
- **Status:** Active
- **Owner:** Unassigned
- **Plan:** None
- **Progress:** Fork workflow policy is documented and stale notes were reconciled on 2026-04-12
- **Blocked by:** Nothing
- **Next:** Keep this status file current after QA runs or release-adjacent changes.
- **Notes:** `origin/main` is the authoritative branch for this fork; `upstream` is fetch-only reference material.

## Backlog (prioritized)
1. Run optional native Windows tray/toast spot checks before a broader release and record the outcome in `docs/superpowers/qa/release-readiness.md`.
2. Archive or shrink the launcher implementation plan now that the gate is green.
3. Decide whether Windows smoke coverage should remain local-only or move into CI.

## Recently Completed
- [2026-04-12] Documented the fork-only workflow in `README.md` — `54fa3b9`
- [2026-04-12] Added desktop smoke coverage and the Windows QA checklist — `3895be7`
- [2026-04-12] Registered runtime custom agents cleanly in launcher flows — `0a6dec0`
- [2026-04-12] Repaired launcher launch and restore contracts — `3f6c8b3`
- [2026-04-12] Recorded the automated Windows desktop QA run, added tray/notification/deep-link unit coverage, added launcher custom-agent cleanup smoke coverage, and fixed Electron channel-focus + stop/delete cleanup races — local workspace change
- [2026-04-05] Landed the launcher implementation and API/test scaffolding — `93d32b6`, `141c9ed`, `686088d`, `0d776af`, `6589d2b`

## Parking Lot
Items discussed but not yet planned:
- Decide whether a separate native-desktop release checklist is still needed beyond `docs/superpowers/qa/release-readiness.md` and the existing QA gate.
- Reduce or archive superseded implementation plans once their follow-up QA is fully recorded.

## Decision Log
| Date | Decision | Context |
|------|----------|---------|
| 2026-04-12 | Treat `origin/main` as the authoritative branch for this fork and keep `upstream` read-only. | Documented in `README.md` fork workflow policy. |
| 2026-04-12 | Keep the Electron shell as a wrapper around the same local `run.py` server on port `8300`. | Documented in the Windows desktop shell section of `README.md`. |
| 2026-04-12 | Use an HttpOnly `session` cookie for browser auth; do not rely on a JS-readable token global. | Reflected in `app.py`, `static/chat.js`, and the reconciled memory note. |
