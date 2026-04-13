# Known Issues & Next Milestones — agentchattr
Last updated: 2026-04-12

## Known Issues And Operational Caveats

| Area | Current state | Impact | Workaround / next action |
|------|---------------|--------|--------------------------|
| Multi-instance rename + `/resume` | Known rough edge | If agents are relaunched in a different order, an instance can reclaim the wrong prior name | Launch instances in the same order when possible, or correct names via the status pills |
| Native tray + toast validation | No known failing bug, but not fully human-signed-off | Automation is strong, but native Windows behavior still benefits from a real desktop check | Run the manual checks in `desktop-shell-checklist.md` before a broader release |
| Windows desktop smoke in CI | Not implemented | Regressions rely on local QA discipline instead of CI catching them | Decide whether to keep smoke local-only or add Windows CI coverage |
| Electron ownership of port `8300` | Intentional constraint, easy to violate during local testing | Parallel local launches can create confusing startup or shutdown conflicts | Keep Electron as the sole owner of the embedded server during desktop-shell validation |

## What Is Stable

- Core browser/server workflow for multi-agent chat is present and usable
- Launcher lifecycle behavior is implemented and smoke-covered
- Desktop shell deep links, tray logic, notifications, and shutdown cleanup have automated coverage
- Custom-agent stop/delete cleanup now has explicit launcher-facing coverage
- Agents can open HTTP(S) URLs inside the Electron shell through a docked browser pane or a pop-out browser window

## Next Milestones

### 1. Desktop Shell Release Signoff

- Run the optional native Windows spot checks for tray and toast behavior
- Record the outcome in `release-readiness.md`
- If the checks stay clean, treat the desktop wrapper as signed off for release-adjacent work

### 2. Launcher Maintenance Cleanup

- Keep the launcher smoke coverage focused on lifecycle behavior rather than reopening implementation scope

### 3. QA Process Decision

- Decide whether Windows smoke coverage stays local-only or moves into CI
- If it stays local-only, preserve a clear human-owned release checklist

### 4. Status And Docs Hygiene

- Keep `docs/project-status.md` current after QA runs and release-adjacent fixes
- Prefer short operational notes over long implementation plans once a feature is in maintenance mode

## References

- `README.md`
- `docs/project-status.md`
- `docs/superpowers/qa/desktop-shell-checklist.md`
- `docs/archive/shipped/2026-04-05-agent-launcher-panel.md`
