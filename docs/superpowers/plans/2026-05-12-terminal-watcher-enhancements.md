# Terminal Watcher Enhancements — Implementation Plan

> **For agentic workers:** Execute this in small PRs. Each phase is independently shippable.

**Goal:** Make the existing watcher settings discoverable from the chat surface, then add two new triggers that turn terminal output into rich chat surfaces:

1. Image paths → clickable inline thumbnails that expand to full image.
2. Markdown files presented/created → chat message with a button that opens the rendered file in a popup Electron window.

**Architecture:** Reuse the existing `watcher-engine` → `terminal-manager` bridge that POSTs matched lines to `/api/bridge/event`. Existing chat-side `inlineImagePreviewCache` + `/api/image-previews/resolve` pipeline already renders images from text — image work is mostly adding the watcher rule and tightening the resolver. Markdown viewer is net new: server file endpoint + Electron BrowserWindow + chat-side message decoration.

**Tech Stack:** Existing Electron main + renderer (bridge.bundle.js / terminals.bundle.js), FastAPI app.py, watcher-engine.js, chat.js inline-preview pipeline.

---

## Decisions (locked 2026-05-12)

- Settings UI stays Electron-only — no web-chat equivalent. Focus on discoverability.
- Image detection is strict: absolute or repo-relative paths only, file must exist on disk.
- Markdown viewer opens a **new Electron BrowserWindow** popup.
- Markdown rule fires only when phrasing implies creation/presentation ("created", "wrote", "saved to", "see", "refer to", etc.), not on bare `.md` mentions.

---

## File Map

### New files

| File                               | Responsibility                                                                      |
| ---------------------------------- | ----------------------------------------------------------------------------------- |
| `electron/renderer/md-viewer.html` | Standalone Electron page that fetches and renders a markdown file                   |
| `electron/renderer/md-viewer.js`   | Markdown rendering + theme application for the popup                                |
| `electron/md-viewer-window.js`     | Main-process helper that creates the popup BrowserWindow                            |
| `static/md-preview.js`             | Chat-side decorator that adds the "Open" button to messages matching markdown paths |
| `tests/test_file_read_md.py`       | Test the new markdown read endpoint (auth + path traversal)                         |
| `electron/qa/md-viewer.test.cjs`   | Smoke test for popup window creation                                                |

### Modified files

| File                                                  | What changes                                                                                                         |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `electron/default-watcher-rules.json`                 | Add `builtin-image-path` and `builtin-markdown-mention` rules                                                        |
| `data/watcher-rules.json`                             | Regenerated on first launch from defaults (existing logic)                                                           |
| `electron/watcher-engine.js`                          | Add extraction-style match (capture the matched path) alongside line-fire, for image/md categories                   |
| `electron/terminal-manager.js`                        | Propagate captured path metadata to the bridge POST so chat messages carry structured `image_path` / `markdown_path` |
| `app.py`                                              | Add `GET /api/file/markdown` (auth + path-traversal guard, file must be inside REPO_ROOT)                            |
| `app.py` (image resolver)                             | Tighten `/api/image-previews/resolve` to require existence on disk (already does, just verify)                       |
| `static/chat.js`                                      | Wire `static/md-preview.js` into the message render pipeline                                                         |
| `electron/main.js`                                    | IPC handler `bridge:open-md-viewer` → calls `md-viewer-window.js`                                                    |
| `electron/preload.js`                                 | Expose `openMarkdownViewer(path)` on `window.electronAPI`                                                            |
| `electron/renderer/terminals.js` (or main chat shell) | Move/duplicate the watcher gear button into the chat header for visibility                                           |

---

## Phase 1 — Settings Discoverability

**Files:**

- Modify: `electron/renderer/terminals.js` (or wherever the gear lives now)
- Modify: chat header / toolbar markup in `static/index.html`

The Watcher Settings panel (`bridge.bundle.js:21851`) already works. Just make the trigger easy to find from the chat surface.

- [x] Audit current placement of the gear button (`terminals.bundle.js:13643` / `terminals.js:751`) and the `bridge:toggle-settings` event.
- [x] Add a visible "Watcher rules" entry to the chat header / settings menu in the Electron shell.
- [x] Dispatch `bridge:toggle-settings` from the new entry point.
- [x] Verify the gear in the terminal pane still works (don't remove, just duplicate access).
- [ ] Smoke test: click new entry, panel opens; toggle a rule off; relaunch; toggle persisted. _(manual — relaunch desktop and confirm)_

**Exit criteria:** A user who has never opened the terminal pane can find and use the watcher settings.

---

## Phase 2 — Image Path Watcher

**Files:**

- Modify: `electron/default-watcher-rules.json` (add rule)
- Modify: `electron/watcher-engine.js` (capture-group support)
- Modify: `electron/terminal-manager.js` (pass captured path in bridge event)
- Verify: `app.py:1566` (`/api/image-previews/resolve` existence check)
- Verify: `static/chat.js:35,657-733` (inline-image-preview pipeline)

The chat already inlines images when a path appears in a message. We just need the watcher to _put the path into a chat message_, and the resolver to confirm the file exists.

- [x] Add `builtin-image-path` rule to `default-watcher-rules.json`. Pattern: `((?:[A-Za-z]:)?(?:[/\\][\w.\-]+)+\.(?:png|jpe?g|gif|webp|bmp|svg|ico))` — absolute or relative paths with at least one separator. Bare `foo.png` is intentionally excluded.
- [x] Update `watcher-engine.js` to expose the first capture group as `event.captured`.
- [x] Add backfill on rule-load so users with an existing `data/watcher-rules.json` automatically pick up new builtin rules.
- [x] Update server `bridge_event` handler to forward `captured` into chat-message metadata.
- [x] Extend the chat-side image-path regex (`static/chat.js`) to also match Windows drive prefixes like `C:/...`. The existing `/api/image-previews/resolve` resolver already validates file existence and enforces a `_safe_join` path-traversal guard against project_root/upload_dir/screenshots/home — no resolver changes needed.
- [ ] Manual test: `echo C:/AI/JAgentchattr/electron/assets/icon.svg` in the embedded terminal → chat shows path with inline preview thumbnail; click → opens full size. _(verify after relaunch)_
- [ ] Manual test: `echo /tmp/nonexistent.png` → no preview rendered. _(verify after relaunch)_

**Exit criteria:** Any image path emitted to the pty surfaces in chat with a clickable, expandable preview.

---

## Phase 3 — Markdown File Watcher + Viewer

**Files:**

- Create: `electron/md-viewer-window.js`
- Create: `electron/renderer/md-viewer.html`
- Create: `electron/renderer/md-viewer.js`
- Create: `static/md-preview.js`
- Modify: `electron/default-watcher-rules.json`
- Modify: `electron/main.js`, `electron/preload.js`
- Modify: `static/chat.js` (load md-preview.js)
- Modify: `app.py` (new `/api/file/markdown` endpoint)

Net new viewer. Pattern detects markdown files presented or created.

### Watcher rule

- [ ] Add `builtin-markdown-mention` rule to `default-watcher-rules.json`:
  - `category: "markdown_reference"`, `priority: 2`
  - Pattern (case-insensitive): `(?:created|wrote|saved (?:to|at)?|generated|see|refer to|check out|view|written to|opened|here(?:'s| is))\s+(?:[`'"\\[]?)((?:[A-Za-z]:)?[\\/\\\\][\w.\-\\/\\\\@]+\.md)\b`
  - Capture group 1 = the .md path

### Server endpoint

- [ ] `GET /api/file/markdown?path=<absolute>` in `app.py`:
  - Requires session token (default auth path)
  - Resolves `path` to an absolute path, rejects if not inside REPO_ROOT (or a configured allowlist)
  - Rejects if not `.md`
  - Returns `{ "path": ..., "name": ..., "content": "..." }`
  - Adds `tests/test_file_read_md.py` covering: happy path, traversal attempt (`../../etc/passwd`), non-md extension, missing file.

### Markdown viewer window

- [ ] `electron/md-viewer-window.js` exports `createMarkdownViewer(filePath, sessionToken)`:
  - Creates a 800x900 BrowserWindow with `webPreferences.preload` pointed at `preload.js`
  - Loads `electron/renderer/md-viewer.html?path=<encoded>`
  - Inherits the active app theme (via existing theme IPC)
- [ ] `electron/renderer/md-viewer.html` — minimal shell that imports `md-viewer.js`
- [ ] `electron/renderer/md-viewer.js`:
  - Reads `?path=` from URL
  - Fetches `/api/file/markdown` with `X-Session-Token` header (token surfaced via preload)
  - Renders content with the same markdown library chat.js uses
  - Applies theme CSS variables from the parent window
- [ ] IPC `bridge:open-md-viewer` in `electron/main.js` calls `createMarkdownViewer(path, getSessionToken())`
- [ ] `electron/preload.js` exposes `window.electronAPI.openMarkdownViewer(path)`

### Chat-side decoration

- [ ] `static/md-preview.js` finds messages with a captured `markdown_path` (sent by the bridge) or scans message text for `.md` paths post-hoc; appends an "Open in viewer" button.
- [ ] Button onclick → `window.electronAPI?.openMarkdownViewer(path)`. If not in Electron, falls back to a new browser tab pointed at `/api/file/markdown` (raw).
- [ ] `static/chat.js` imports `md-preview.js` and calls its decorator from the message render hook.

### Tests

- [ ] `tests/test_file_read_md.py` — endpoint tests above.
- [ ] `electron/qa/md-viewer.test.cjs` — module-loadable, `createMarkdownViewer` returns a BrowserWindow instance with the right title.

**Exit criteria:** A terminal line like `wrote README.md` or `created C:/AI/JAgentchattr/notes.md` produces a chat message with an "Open" button. Clicking it opens a themed popup window with the file rendered as markdown. Path-traversal attempts are rejected by the server.

---

## Validation

- [ ] Run existing electron unit tests after each phase: `cd electron && node --test qa/*.test.cjs`
- [ ] Run Python tests touching app.py: `pytest tests/test_file_read_md.py -v`
- [ ] Manual: launch desktop, run scripted commands in the embedded terminal that emit known paths (real + fake), verify chat behavior.

---

## Non-Goals

- Web-chat-only settings UI (deferred; Electron is the primary surface)
- Editing markdown in the popup (read-only viewer)
- Lazy/streaming image loading (whole image loads at click)
- Detecting binary files other than the listed image extensions
- Capturing rendered markdown back into the chat log

---

## Decision Log

| Date       | Decision                                              | Why                                                                           |
| ---------- | ----------------------------------------------------- | ----------------------------------------------------------------------------- |
| 2026-05-12 | Settings UI Electron-only                             | Lowest scope; existing infrastructure already in bridge.bundle.js             |
| 2026-05-12 | Image paths must exist on disk to surface             | Fewer false positives from logs/error messages                                |
| 2026-05-12 | Markdown viewer is a new BrowserWindow                | Matches user mental model ("pull up in a new window"); inherits theme cleanly |
| 2026-05-12 | Markdown rule requires creation/presentation phrasing | Bare `.md` mentions in logs/grep output would otherwise spam chat             |
