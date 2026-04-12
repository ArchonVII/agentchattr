# Next Agent Follow-Up Plan

**Date:** 2026-04-12  
**Base branch:** `main`  
**Starting point:** `0a6dec0` (`fix(launcher): Register runtime custom agents`)

## Approach

The launcher panel and Electron desktop shell are now merged into `main` and pass the current local verification stack. The next agent should focus on turning that merged work into durable follow-up assets: repo-owned smoke coverage, user-facing documentation, and a clear QA/release checklist for the desktop workflow.

## Current State

- Launcher + Electron code is merged into `main`.
- Current local verification that already passed on `main`:
  - `.venv\Scripts\python -m pytest tests -q`
  - `node --test tests/launcher_helpers.test.cjs`
  - `node --check static/launcher.js`
  - `node --check electron/main.js`
  - `node --check electron/renderer/renderer.js`
  - Playwright launcher smoke against `http://127.0.0.1:8300`
  - Playwright Electron smoke against `electron/node_modules/electron/dist/electron.exe`
- The browser/Electron smoke scripts used in validation are currently ad hoc temp files, not repo-owned test assets.

## Scope

- In:
  - Repo-owned launcher and Electron smoke coverage
  - README and docs updates for the desktop shell and launcher workflows
  - A manual QA checklist for tray, notifications, deep links, ports, restore, and custom agents
  - Small enabling cleanup needed to make the above maintainable
- Out:
  - Large UI redesigns
  - Auto-update/distribution work
  - Cross-platform Electron packaging
  - Re-architecting launcher or registry internals unless required by the test/docs work

## Constraints

- `tests/` is matched by `.gitignore`, so any new tracked test files will need `git add -f` unless the ignore rule is narrowed.
- Electron smoke automation assumes Windows and a bootstrapped `electron/node_modules/`.
- The Electron app uses a single-instance lock; close any resident Electron instance before automated launch tests.
- The desktop shell expects to own port `8300`; do not leave a standalone `run.py` server running when validating Electron startup.

## Action Items

- [ ] Audit the merged launcher/Electron workflow from a fresh `main` checkout and confirm which manual steps still rely on local temp scripts instead of repo files.
- [ ] Decide where durable smoke coverage should live.
  Candidate options: tracked files under `tests/` with a `.gitignore` fix, or a dedicated `scripts/qa/` directory with documented entrypoints.
- [ ] Promote the current launcher smoke flow into a repo-owned script.
  Cover: add disposable custom agent, launch, open logs, launch second instance, reload, restore banner, cleanup.
- [ ] Promote the current Electron smoke flow into a repo-owned script.
  Cover: app launch, embedded server bootstrap, `focus-channel` bridge, tab switching, and clean app shutdown.
- [ ] Add README coverage for the Electron shell.
  Minimum topics: install path, start command, port ownership expectations, tray behavior, and how the desktop app differs from running `run.py` directly.
- [ ] Add a QA checklist doc for post-merge validation.
  Include tray, notifications, deep links, ports tab, launcher restore, duplicate instances, custom agent lifecycle, and shutdown behavior.
- [ ] Decide whether any part of the smoke coverage should be wired into CI now.
  If not, document the reason and provide a stable local command sequence for maintainers.
- [ ] Run the full validation stack again from the repo-owned commands and capture the exact expected outputs in the docs/PR.

## Validation

- `.venv\Scripts\python -m pytest tests -q`
- `node --test tests/launcher_helpers.test.cjs`
- `node --check static/launcher.js`
- `node --check electron/main.js`
- `node --check electron/renderer/renderer.js`
- Repo-owned launcher smoke command
- Repo-owned Electron smoke command

## Open Questions

- Should new smoke tests live under `tests/` with a `.gitignore` cleanup, or stay outside `tests/` to avoid force-add workflows?
- Do we want Windows-only Electron smoke in CI now, or is a documented local QA gate enough for the next release?
- Should the README document Electron as the preferred desktop entrypoint, or keep it positioned as an optional wrapper around the web app?
