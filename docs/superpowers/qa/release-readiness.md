# Release Readiness — Desktop Shell & Launcher
Last updated: 2026-04-12

## Recommendation

- **Status:** Release candidate
- **Blocking issues:** None known from the current automated gate
- **Recommended before a broader Windows release:** Perform a real-desktop spot check for tray icon behavior and native toast presentation

This repo is in a good shipping posture for local and internal use. The launcher implementation is landed, the desktop wrapper is functioning, and the current workspace passes the full local QA gate. The remaining gap is confidence-signoff on native Windows behavior that automation only approximates.

## Verified On 2026-04-12

- `.venv\\Scripts\\python -m pytest tests -q`
- `node --test tests/launcher_helpers.test.cjs`
- `npm --prefix electron test`
- `node --check static/launcher.js`
- `node --check electron/main.js`
- `node --check electron/renderer/renderer.js`
- `npm --prefix electron run smoke:launcher`
- `npm --prefix electron run smoke:desktop`

## Coverage Confirmed By The Current Gate

- Launcher panel rendering and control flow
- Duplicate launcher instances with distinct runtime names
- Restore banner behavior after reload
- Explicit custom-agent stop and delete flows
- Deep-link dispatch into an already-running desktop shell
- Notification badge updates and click handling
- Tray show/hide/quit behavior
- Release of port `8300` on Electron shutdown
- Ports tab render and desktop wrapper startup

## Remaining Manual Signoff

- Verify tray icon behavior on a real Windows desktop session
- Verify native Windows toast display and click-to-focus behavior
- Verify a clean shutdown/relaunch cycle after quitting from the tray menu

## Operational Constraints

- Port `8300` must be free before Electron starts
- The Electron shell should own the embedded `run.py` lifecycle
- Do not run `windows\\start.bat`, `python run.py`, or another Electron instance alongside the shell you are validating

## Hold Criteria

Do not treat the build as release-ready if any of the following happens:

- `smoke:launcher` or `smoke:desktop` fails
- Electron leaves `run.py` or port `8300` behind after quit
- Deep links stop focusing the existing instance
- Custom agents cannot be stopped and deleted cleanly from the launcher

## Reference Docs

- `docs/superpowers/qa/desktop-shell-checklist.md`
- `docs/project-status.md`
- `docs/superpowers/qa/known-issues-next-milestones.md`
