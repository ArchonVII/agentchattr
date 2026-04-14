# Terminals Feature Design

**Date:** 2026-04-13
**Status:** Approved
**Approach:** Electron-native with IPC plumbing (Approach A)

## Overview

Two-phase feature adding terminal awareness and embedded terminal sessions to the agentchattr Electron desktop app.

- **Phase A** — Scan external terminal processes on the host machine, display them in the presence panel sidebar.
- **Phase B** — Embed interactive terminal sessions (xterm.js + node-pty) inside the app via a new Terminals tab, with pop-out support.

Both phases share a unified presence panel section and a merged data model.

---

## Phase A — External Terminal Scanning

### Terminal Scanner (`electron/terminal-scanner.js`)

Runs in the Electron main process on a 3-second polling interval. Follows the same pattern as `electron/port-scanner.js`.

**Detection targets:**
- `pwsh.exe` (PowerShell 7)
- `powershell.exe` (PowerShell 5)
- `cmd.exe`
- `bash.exe` / `wsl.exe` (WSL)
- `git-bash.exe`
- `wt.exe` (Windows Terminal host — used for enrichment, not listed directly)

**Windows Terminal enrichment:**
When `wt.exe` is detected as a parent process of a shell, `windowTerminalTab` is set to `true` and the tab title is read from the window title string.

### Data Shape

Each terminal session emits:

```js
{
  id: string,          // stable identifier: PID-based for external, uuid for embedded
  pid: number | null,  // OS process ID (null for embedded until spawned)
  name: string,        // display name: window title or user-assigned name
  shell: string,       // e.g. "pwsh", "cmd", "bash"
  source: "external" | "embedded",
  status: "running" | "idle",  // "running" if process exists; "idle" if no CPU activity in last scan interval
  startedAt: number,   // timestamp
  cwd: string | null,  // working directory if detectable
  windowTerminalTab: boolean  // true if detected inside Windows Terminal
}
```

### Presence Panel UI

A new collapsible "Terminals" section appears below the existing participant roster in `#presence-panel`:

- **Section header:** "Terminals" with a count badge, click to collapse/expand. Collapsed state persisted in localStorage.
- **Each terminal item shows:**
  - Status dot: green for running, grey for idle (reuses `.presence-state-dot`)
  - Shell type label (pwsh, cmd, bash) + display name (window title)
  - Metadata line: PID and relative time since started (`.presence-meta` styling)
- **External terminals:** No click action in Phase A.
- **Embedded terminals (Phase B):** Click navigates to Terminals tab and focuses that session. Distinguished by a subtle `>` glyph before the name.

**Sorting within the section:**
1. Embedded terminals first
2. External terminals second
3. Within each group, sorted by most recently started

---

## Phase B — Embedded Terminals

### Terminals Tab

A third tab in the Electron tab bar alongside Chat and Ports, with the same pop-out button.

```
[ Chat ] [^] [ Ports ] [^] [ Terminals ] [^]
```

### Layout

- **Terminal tab strip** — horizontal tabs for each embedded session, plus a `[+]` button to create new ones. Each tab shows `shell: name` and has a close button on hover.
- **Terminal surface** — xterm.js instance filling the remaining space below the tab strip.
- **New terminal flow** — clicking `[+]` opens a dropdown listing detected shells. Auto-detects available shells on startup. Default is pwsh. Opens in the project working directory.

### Terminal Naming

- Default: shell type + incrementing number (`pwsh 1`, `pwsh 2`, `bash 1`)
- Double-click the tab label to rename inline (same pattern as channel rename)

### Lifecycle

- Unlimited concurrent terminals
- Terminals persist for the lifetime of the Electron session
- On process exit (user types `exit`), tab shows "[exited]" — can be closed or restarted
- No persistence across app restarts — terminals are ephemeral

### Pop-out

The pop-out button opens the entire terminals view in a separate window (same mechanism as Chat/Ports).

### Dependencies (new npm packages)

- `xterm` — terminal emulator UI
- `@xterm/addon-fit` — auto-resize to container
- `@xterm/addon-web-links` — clickable URLs
- `node-pty` — pseudo-terminal backend (native module, needs rebuild for Electron)

---

## Terminal Manager (`electron/terminal-manager.js`)

Runs in the Electron main process. Manages node-pty instances.

**Responsibilities:**
- Spawn and kill pty processes
- Detect available shells on the system
- Track active embedded terminal PIDs (shared with scanner for deduplication)
- Bridge stdin/stdout between renderer and pty instances

---

## IPC Surface

### Channels

| Channel | Direction | Purpose |
|---|---|---|
| `terminal-data` | main -> renderer | Scanner emits full external + embedded terminal list |
| `terminal:create` | renderer -> main | Request new embedded terminal `{ shell, name?, cwd? }` |
| `terminal:created` | main -> renderer | Confirms creation `{ id, shell, pid, name }` |
| `terminal:input` | renderer -> main | Keystrokes to pty `{ id, data }` |
| `terminal:output` | main -> renderer | Pty stdout data `{ id, data }` |
| `terminal:resize` | renderer -> main | Resize pty `{ id, cols, rows }` |
| `terminal:close` | renderer -> main | Request pty kill `{ id }` |
| `terminal:exited` | main -> renderer | Pty process exited `{ id, exitCode }` |
| `terminal:list-shells` | renderer -> main | Request available shells |
| `terminal:shells` | main -> renderer | Returns detected shells `[{ id, name, path }]` |

### Preload API

```js
window.electronAPI = {
  // Phase A
  onTerminalData: (cb) => ...,

  // Phase B
  createTerminal: (opts) => ...,        // invoke, returns promise
  sendTerminalInput: (id, data) => ...,
  resizeTerminal: (id, cols, rows) => ...,
  closeTerminal: (id) => ...,
  listShells: () => ...,                // invoke, returns promise
  onTerminalOutput: (cb) => ...,
  onTerminalCreated: (cb) => ...,
  onTerminalExited: (cb) => ...,
}
```

### Security

- `terminal:create` and `terminal:input` are only exposed to the Electron renderer, never to webview guest content.
- The existing partition separation (`persist:agentchattr` for chat webview) prevents the chat web app from accessing terminal APIs.

---

## Integration — Deduplication

When an embedded terminal's PID matches a process the external scanner detects, the scanner excludes it. The terminal manager shares its active PIDs with the scanner for this purpose.

### Renderer State

```js
state.terminals = [];  // merged list from both sources
```

Updated on `terminal-data` (scanner) and `terminal:created` / `terminal:exited` (manager) events.

---

## File Map

### New Files

| File | Purpose |
|---|---|
| `electron/terminal-scanner.js` | External terminal process detection + Windows Terminal enrichment |
| `electron/terminal-manager.js` | node-pty lifecycle, shell detection, PID sharing with scanner |
| `electron/renderer/terminals.js` | xterm.js instances, tab strip UI, embedded terminal renderer logic |
| `electron/renderer/terminal-presence.js` | Presence panel "Terminals" section rendering |

### Modified Files

| File | Change |
|---|---|
| `electron/main.js` | Import scanner + manager, register IPC handlers, wire polling |
| `electron/preload.js` | Expose new `electronAPI` methods |
| `electron/preload-webview.js` | Expose `onTerminalData` for presence panel (read-only) |
| `electron/renderer/index.html` | Add Terminals tab button, terminals container div, script tags |
| `electron/renderer/renderer.js` | Add `state.terminals`, bind terminal IPC events, tab switching |
| `static/chat.js` | Add terminal section rendering inside `renderChannelRoster()` |
| `static/style.css` | Terminal presence section styles |
| `electron/package.json` | Add xterm, @xterm/addon-fit, @xterm/addon-web-links, node-pty |

---

## Build Sequence

### Phase A — Scanning and Presence UI
1. `terminal-scanner.js` — process enumeration and Windows Terminal enrichment
2. Preload + main process wiring for `terminal-data` channel
3. `terminal-presence.js` — presence panel section rendering
4. Wire into `renderChannelRoster()` in `chat.js`
5. Style additions in `style.css`

### Phase B — Embedded Terminals
1. Install npm dependencies (xterm, node-pty, addons)
2. `terminal-manager.js` — pty spawning, shell detection, lifecycle
3. Full IPC registration in main.js and preload
4. `terminals.js` — xterm.js renderer, tab strip, terminal surface
5. Terminals tab in `index.html` and `renderer.js`
6. Deduplication between scanner and manager
7. Embedded terminal click-through from presence panel
