# Bridge: Watcher Events Not Reaching Chat Timeline

## Status: Open — needs debugging

## Problem

The terminal-to-chat bridge (`feat/terminal-chat-bridge`) is fully wired but watcher-matched events are not appearing in the chat timeline when testing with `echo BRIDGE_TEST`.

## Architecture

```
PTY onData() → WatcherEngine.scan() → pattern match → POST /api/bridge/event → store.add() → WebSocket broadcast → chat UI
                                                     → IPC terminal:bridge-event → React BridgeEventBadge
```

## What we've tried

1. **Added debug logging** to `terminal-manager.js` at the `onData` hook and `onMatch` callback — no `[bridge-debug]` output appeared in the Electron main process console, suggesting either:
   - The terminal-manager module isn't being loaded with our changes
   - The `setup(win)` call (which registers `onMatch`) happens after/before expected
   - The PTY data isn't flowing through our modified path

2. **Fixed a blocking xterm.js v6 bug** — `bufferLine.translateToString is not a function` was spamming hundreds of errors per second on every mouse hover over the terminal. The `registerLinkProvider` API changed in xterm.js v6: `provideLinks` now receives a line number (integer) instead of a buffer line object. This error was crashing the renderer event loop. Fixed in `bcad9d4`.

3. **After fixing the xterm.js bug**, the bridge test still didn't work. The error spam is gone but events still don't reach chat.

## Likely root causes to investigate

- **Module caching**: `terminal-manager.js` is `require()`'d in multiple places in `main.js` (lines 83-104 use inline `require("./terminal-manager")` per IPC handler). The `WatcherEngine` is instantiated at module load time, but `onMatch` is only wired in `setup(win)`. Need to verify `setup()` is actually called and the same module instance is used everywhere.

- **The `postBridgeEvent` HTTP request**: fire-and-forget POST to `127.0.0.1:8300/api/bridge/event`. The Python backend may not have the route loaded if `app.py` changes aren't picked up by the running server. Need to verify the endpoint exists by hitting it manually with curl.

- **ANSI stripping in WatcherEngine**: the `scan()` method strips ANSI sequences before pattern matching. PowerShell prompt output is heavily ANSI-decorated. The stripped text may not match `BRIDGE_TEST` if the echo output contains unexpected control sequences splitting the text across chunks.

- **Line buffering**: PTY data arrives in arbitrary chunks. `echo BRIDGE_TEST` in PowerShell may arrive as multiple chunks where `BRIDGE_TEST` spans a chunk boundary, so the line buffer never sees the complete match on a single line.

## Next steps

1. Add a curl test: `curl -X POST http://127.0.0.1:8300/api/bridge/event -H "Content-Type: application/json" -d '{"matchedText":"test","category":"completion","terminalId":"manual","ruleId":"test"}'` — verify the backend endpoint works independently
2. Add a simple test in the Electron main process console: `require("./terminal-manager").getWatcherRules()` — verify the engine loaded rules
3. Check if `echo BRIDGE_TEST` output survives ANSI stripping by logging the stripped text in `WatcherEngine._processLine`
4. Consider adding a manual "bridge test" button in the UI that bypasses PTY and directly calls `postBridgeEvent` with a hardcoded payload
