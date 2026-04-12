# Desktop Shell QA Checklist

Use this when validating the launcher and Electron desktop workflow on Windows after changes to `static/launcher.js`, `app.py`, or anything under `electron/`.

## Preconditions

- [ ] `.venv` exists at the repo root.
- [ ] `npm --prefix electron install` has been run at least once.
- [ ] `electron/node_modules/electron/dist/electron.exe` exists.
- [ ] No standalone `run.py` server is already holding port `8300`.
- [ ] No resident Electron instance is still running in the tray.

## Automated Gate

- [ ] `.venv\Scripts\python -m pytest tests -q`
- [ ] `node --test tests/launcher_helpers.test.cjs`
- [ ] `npm --prefix electron test`
- [ ] `node --check static/launcher.js`
- [ ] `node --check electron/main.js`
- [ ] `node --check electron/renderer/renderer.js`
- [ ] `npm --prefix electron run smoke:launcher`
- [ ] `npm --prefix electron run smoke:desktop`

If either smoke command fails, inspect the screenshots and logs written to `data/qa-artifacts/`.

## Manual Checks

- [ ] Tray lifecycle
  Start the desktop shell, close the main window, confirm it hides to the tray, restore it with the tray icon, then quit from the tray menu and confirm the app exits fully.
- [ ] Notifications and unread badge
  With the shell unfocused, trigger a notification from the chat UI or a webview-originated event and confirm the native toast appears, clicking it focuses the window, and the unread badge clears when the app regains focus.
- [ ] Deep links
  Launch `agentchattr://channel/general` and `agentchattr://port/8300` while the shell is already running and confirm the existing instance focuses the correct tab/channel instead of spawning a duplicate app.
- [ ] Ports tab
  Open the Ports tab, confirm active listeners appear, and verify the kill action behaves sensibly for a disposable local process before using it on anything important.
- [ ] Launcher custom-agent lifecycle
  Add a disposable custom agent, launch it, confirm logs are available, stop it, and delete the definition cleanly.
- [ ] Duplicate instances
  Launch the same agent twice and confirm each instance gets a unique name, its own status pill, and independent stop/log controls.
- [ ] Restore banner
  With launcher-started agents still in the saved restore state, refresh the browser UI and confirm the restore banner appears and relaunches the selected agents.
- [ ] Shutdown cleanup
  After quitting Electron, confirm neither Electron nor `run.py` still owns port `8300`, then relaunch the shell to verify the next start is clean.

## CI Note

The smoke commands stay local-only for now. They depend on Windows, an installed Edge channel for Playwright browser automation, Electron's single-instance lock, and exclusive ownership of port `8300`.
