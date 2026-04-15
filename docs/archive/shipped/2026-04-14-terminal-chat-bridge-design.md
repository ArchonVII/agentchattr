# Terminal-to-Chat Bridge — Design Spec

## Context

The agentchattr Electron app has two isolated communication worlds: terminals (PTY via node-pty → xterm.js) and the chat room (Python FastAPI + WebSocket + MCP bridge). Agents running in terminals produce valuable output — errors, completions, progress — that never reaches the chat timeline. Users must manually context-switch between terminal and chat to relay information.

This feature bridges the gap: terminal output flows into the chat room automatically via passive watchers, with manual snapshot controls for on-demand sharing. Messages appear attributed to the agent running in that terminal.

## Decisions

- **Hybrid architecture**: pattern matching in Electron main process, renderer notified via IPC for inline badges
- **No Shadow Stream protocol**: agents already have `chat_send` via MCP — no redundant escape sequence path
- **React for new components**: coexists with existing vanilla JS; new UI only
- **All watcher categories**: errors, completions, file refs, progress, custom patterns
- **Three snapshot methods**: toolbar button, chat-side pull, right-click context menu
- **Agent attribution**: bridged messages show as `{agent-name}` with session/terminal name context

## Architecture

### Data Flow

```
PTY Process (node-pty)
    │ .onData(raw)
    ▼
WatcherEngine (main process)          ← NEW: electron/watcher-engine.js
    │
    ├──► Pattern match? ──► POST /api/bridge/event ──► Chat timeline
    │                   ──► IPC terminal:bridge-event ──► React badges
    │
    └──► terminal:output (unchanged) ──► xterm.js .write()
```

### Components

```
electron/
  watcher-engine.js          ← NEW: line buffering, pattern scanning, dispatch
  terminal-manager.js        ← MODIFY: integrate WatcherEngine, add snapshot buffer
  main.js                    ← MODIFY: register new IPC handlers
  preload.js                 ← MODIFY: expose new bridge APIs
  renderer/
    bridge/                  ← NEW: React component tree (Electron renderer side)
      index.jsx              ← React entry point, mounts into DOM containers
      WatcherSettingsPanel.jsx
      SnapshotToolbarButton.jsx
      BridgeEventBadge.jsx
    bridge-ui.js             ← NEW: vanilla ↔ React event bridge
    terminals.js             ← MODIFY: add DOM containers, right-click handler

app.py                       ← MODIFY: add bridge endpoints (POST /api/bridge/event,
                                GET /api/bridge/terminals, GET /api/bridge/snapshot/:id)
static/chat.js               ← MODIFY: render type:"bridge" messages, add snapshot pull button
data/watcher-rules.json      ← NEW: persisted watcher configuration
```

## Section 1: WatcherEngine (Main Process)

New module `electron/watcher-engine.js` sitting between PTY `onData` and the existing IPC send.

**Responsibilities:**
- Receive raw PTY data chunks per terminal
- Buffer partial lines (PTY data arrives in arbitrary chunks, not clean lines)
- Scan completed lines against active watcher rules
- On match: build event object and dispatch to both backend and renderer
- Pass through all data unchanged to `terminal:output`

**Event object shape:**
```json
{
  "terminalId": "abc123",
  "terminalName": "claude-session-1",
  "agentName": "claude",
  "ruleId": "builtin-node-error",
  "category": "error",
  "matchedText": "TypeError: Cannot read property 'foo' of undefined",
  "contextLines": ["at Object.<anonymous> (/src/index.js:42:5)"],
  "timestamp": 1713100000
}
```

**Watcher rules** stored in `data/watcher-rules.json`:
```json
{
  "rules": [
    {
      "id": "builtin-node-error",
      "name": "Node.js errors",
      "category": "error",
      "pattern": "(TypeError|ReferenceError|SyntaxError|RangeError):.*",
      "enabled": true,
      "priority": 1
    }
  ]
}
```

Each rule: `{ id, name, category, pattern (regex string), enabled, priority }`.

**Built-in rule categories:**
- **Errors**: stack traces, common exception patterns (Python/Node/Go/Rust)
- **Completions**: "passed", "succeeded", "built in", exit code 0
- **File references**: `path:line` patterns
- **Progress**: percentage patterns, step counters
- **Custom**: user-defined regex

## Section 2: Python Backend Bridge Endpoint

New route `POST /api/bridge/event` in `app.py`.

**Responsibilities:**
- Receive event payloads from the Electron WatcherEngine
- Resolve sender identity: map `terminalId` → registered agent name via `RuntimeRegistry`
- Construct a chat message with `type: "bridge"`
- Broadcast via existing WebSocket
- Watcher events do NOT count as "hops" in the agent-to-agent loop guard
- Debounce duplicate matches within configurable window (default 2s)

**Bridge message format:**
```json
{
  "sender": "claude",
  "text": "TypeError: Cannot read property 'foo' of undefined",
  "type": "bridge",
  "channel": "general",
  "metadata": {
    "category": "error",
    "terminal_name": "claude-session-1",
    "terminal_id": "abc123",
    "rule_id": "builtin-node-error",
    "context_lines": ["at Object.<anonymous> (/src/index.js:42:5)"],
    "source": "watcher"
  }
}
```

**Rate limiting:**
- Per-terminal burst limit: max 10 events per 30-second window
- After limit: batch into summary message ("15 more errors detected — open terminal to view")
- Thresholds configurable in WatcherSettingsPanel

## Section 3: UI Components — Two Boundaries

Components live in two separate contexts within the Electron app:

1. **Electron renderer** (terminal side) — `electron/renderer/` — owns xterm.js, terminal toolbars, layout modes
2. **Web chat UI** (chat side) — `static/` — loaded in a BrowserView/WebView, owns the chat timeline and composer

Components are split accordingly. They do NOT share a React tree.

### Electron Renderer Side (React, new)

**Build setup:**
- React + ReactDOM as Electron renderer dependencies
- Vite (or esbuild) bundler → `electron/renderer/dist/`
- Existing vanilla JS continues to own xterm.js, layout modes, Command Arsenal
- `ReactDOM.createRoot()` on specific container divs

**Components:**

#### `<WatcherSettingsPanel />`
- Slides out from gear icon in terminal toolbar
- Toggle built-in rules on/off per category
- Add/edit/delete custom regex rules with live preview
- Per-terminal overrides
- IPC: `terminal:watcher-config-get`, `terminal:watcher-config-set`

#### `<SnapshotToolbarButton />`
- Camera icon on each terminal's title bar
- Click sends last N lines (default 50) to chat via IPC → main process → `POST /api/bridge/snapshot`
- Right-click menu integration: select text in xterm → right-click → "Send to Chat" (selected text only, ANSI-stripped)

#### `<BridgeEventBadge />`
- Small overlay on terminal tab headers
- Count by category: "2 errors", "1 completion"
- Colour-coded: red (errors), green (completions), blue (file refs), yellow (progress)
- Click scrolls chat to most recent bridge event from that terminal
- Auto-clears after configurable timeout or user dismissal

**Vanilla <-> React communication:**
- `bridge-ui.js` module: vanilla JS notifies React of events (terminal created/destroyed, layout changed)
- Shared `CustomEvent` dispatching on `window`

### Web Chat UI Side (vanilla JS, extending existing `static/chat.js`)

These components are added to the existing web chat UI, not as React — they follow the vanilla JS patterns already in `static/chat.js`.

#### Bridge Message Renderer
- Renders `type: "bridge"` messages in the chat timeline
- Terminal icon + session name label
- Category badge (colour-coded)
- Matched text with syntax highlighting
- Expandable context section (surrounding lines)
- "Open in Terminal" link sends a message to Electron (via WebSocket event or postMessage) to focus the source terminal

#### Chat-Side Snapshot Pull
- Button in chat composer area (next to attachments)
- Fetches active terminal list from `GET /api/bridge/terminals`
- Dropdown to pick terminal → backend requests snapshot from Electron via IPC → returns text → inserts into message composer
- This requires a new backend endpoint `GET /api/bridge/terminals` and `GET /api/bridge/snapshot/:terminalId` that proxy to the Electron main process

### Cross-Boundary Communication

The chat WebView and Electron renderer are separate contexts. They communicate via:
- **Python backend as intermediary**: chat UI → REST API → main process (for snapshot pull)
- **WebSocket broadcast**: main process → POST to backend → WebSocket → chat UI (for bridge events)
- **Electron IPC**: chat UI "Open in Terminal" → `postMessage` to Electron host → IPC to renderer

## Section 4: IPC Channels & Preload Additions

### New IPC Channels

**Main → Renderer:**
- `terminal:bridge-event` — watcher match event (badges/indicators)
- `terminal:watcher-config-updated` — config changed (sync settings panel)

**Renderer → Main (invoke):**
- `terminal:watcher-config-get` — fetch current watcher rules
- `terminal:watcher-config-set` — update watcher rules
- `terminal:snapshot` — request last N lines from terminal buffer

**Renderer → Main (send):**
- `terminal:bridge-snapshot-to-chat` — send snapshot payload to Python backend

### Preload API

```javascript
electronAPI.onBridgeEvent(callback)
electronAPI.onWatcherConfigUpdated(callback)
electronAPI.getWatcherConfig()
electronAPI.setWatcherConfig(rules)
electronAPI.getTerminalSnapshot(id, lineCount)
electronAPI.sendSnapshotToChat(id, text, agentName)
```

### Snapshot Buffer

`terminal-manager.js` adds a ring buffer per terminal (~500 lines of ANSI-stripped text) for snapshot retrieval. Separate from the WatcherEngine's line buffer.

## Section 5: Agent-Terminal Identity Mapping

### Registration-Based Mapping

- Terminal state extended: `{ pty, shell, name, pid, startedAt, agentName, sessionName }`
- **Manual assignment**: "Assign Agent" dropdown in terminal toolbar, populated from `/api/register` data or free-text
- **Auto-detection**: WatcherEngine watches for agent CLI banners (`claude-code`, `gemini`, `codex`) and auto-suggests mapping
- **Session naming**: user-editable, defaults to "session-1", "session-2", etc.
- **IPC**: `terminal:set-identity` for renderer to update `agentName` and `sessionName`

### Sender Attribution Fallback Chain

1. Explicitly assigned agent name → `"claude"`
2. Auto-detected agent name → `"claude"` (with confirmation prompt)
3. User-set session name → `"build-session"`
4. Terminal default → `"terminal-3"`

## Section 6: Error Handling & Edge Cases

### Rate Limiting / Deduplication
- Recent match cache keyed by `terminalId + ruleId + matchedText hash`
- 2-second dedup window (configurable)
- Burst limit: 10 events per 30s per terminal (configurable)
- After burst: batch into summary message

### Line Buffering
- Buffer incomplete lines (no trailing `\n`), scan on completion
- Flush after 500ms inactivity (handles prompts without trailing newline)
- Max buffer: 8KB per terminal; flush and scan as-is if exceeded

### ANSI Stripping
- Pattern matching runs against ANSI-stripped text
- Snapshot text ANSI-stripped for chat readability
- Raw data passes to xterm unchanged

### Backend Resilience
- `POST /api/bridge/event` failure: log and continue (fire-and-forget)
- Retry once after 1s, then drop
- Renderer badges still work via local IPC even if backend is down

### Right-Click Context Menu
- xterm.js `onContextMenu` handler
- "Send to Chat" shown only when `terminal.getSelection()` is non-empty
- Selected text ANSI-stripped before sending

## Verification Plan

1. **Unit tests**: WatcherEngine pattern matching against sample PTY output (all categories)
2. **Integration test**: spawn a terminal, emit known error text, verify bridge event arrives in chat timeline
3. **Snapshot test**: select text in terminal, right-click → Send to Chat, verify message in chat
4. **Rate limiting test**: flood terminal with errors, verify dedup and burst limiting
5. **Identity test**: assign agent to terminal, verify bridged messages show correct sender
6. **React coexistence**: verify existing vanilla JS terminal features (layouts, Command Arsenal) still work
7. **Backend down**: verify terminal output continues normally when Python backend is unreachable
8. **Manual E2E**: run an actual agent (Claude) in a terminal, trigger an error, verify it appears in chat attributed to "claude" with session name
