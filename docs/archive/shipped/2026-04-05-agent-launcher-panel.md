# Agent Launcher Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a web UI panel that lets users launch, stop, monitor, and configure AI coding agents directly from the browser — no separate terminal windows or batch files needed.

**Architecture:** The server (`app.py`) gains a `ProcessManager` that spawns `wrapper.py` as managed subprocesses, captures their stdout into ring buffers, and exposes launch/stop/logs via REST + WebSocket. A new `launcher.js` frontend module renders the panel following the same pattern as `jobs.js` and `sessions.js`. Agent definitions are stored in `data/agent_definitions.json` and merged with `config.toml` on startup.

**Tech Stack:** Python (FastAPI, subprocess, threading), vanilla JS (Hub pub/sub from core.js), existing WebSocket protocol.

**Spec:** `docs/superpowers/specs/2026-04-05-agent-launcher-panel-design.md`

## Status Snapshot (2026-04-12)

- Implementation landed across `93d32b6`, `141c9ed`, `686088d`, `0d776af`, `6589d2b`, `3f6c8b3`, and `0a6dec0`.
- Automated Windows QA is now recorded in `docs/superpowers/qa/desktop-shell-checklist.md`.
- No blocking automation gaps remain. Optional native-desktop spot-checks can still be done before a release.
- Implementation drift from the original plan: launcher styles ship in `static/launcher.css`, linked from `static/index.html`, instead of staying inline in `static/index.html`.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `process_manager.py` | Create | Spawn/stop wrappers, capture logs, persist launch state |
| `static/launcher.js` | Create | Launcher panel UI, agent cards, log viewer, forms |
| `static/launcher.css` | Create | Launcher panel styling, status badges, logs, and restore banner |
| `app.py` | Modify | REST endpoints, WS events, wire ProcessManager |
| `run.py` | Modify | Create ProcessManager, load restore state |
| `static/index.html` | Modify | Add launcher button, panel container, and launcher asset links |
| `static/chat.js` | Modify | Wire launcher panel toggle, handle new WS events |
| `config_loader.py` | Modify | Merge agent_definitions.json into config |
| `tests/test_process_manager.py` | Create | Unit tests for ProcessManager |
| `tests/test_agent_definitions.py` | Create | Unit tests for agent definitions CRUD |
| `tests/test_launcher_api.py` | Create | Integration tests for launcher REST endpoints |

---

### Task 1: ProcessManager Core — Spawn and Track Wrapper Subprocesses

**Files:**
- Create: `process_manager.py`
- Create: `tests/test_process_manager.py`

- [x] **Step 1: Write the failing test for launch and state tracking**

```python
# tests/test_process_manager.py
import time
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from process_manager import ProcessManager


def test_launch_tracks_state():
    """Launching an agent creates a tracked entry with correct state."""
    pm = ProcessManager(data_dir=Path("./test_data"), server_port=8300)
    result = pm.launch(
        base="testbot",
        command=sys.executable,
        flags=[],
        extra_args=["-c", "import time; time.sleep(0.5); print('hello')"],
        cwd=".",
    )
    assert result["ok"] is True
    assert result["name"] == "testbot"
    assert result["pid"] > 0

    managed = pm.list_managed()
    assert len(managed) == 1
    assert managed[0]["name"] == "testbot"
    assert managed[0]["state"] in ("starting", "running")

    time.sleep(1.5)
    managed = pm.list_managed()
    assert managed[0]["state"] in ("crashed", "stopped")

    pm.shutdown()
    import shutil
    shutil.rmtree("./test_data", ignore_errors=True)


def test_launch_duplicate_base_gets_suffix():
    """Launching the same base twice assigns different names."""
    pm = ProcessManager(data_dir=Path("./test_data"), server_port=8300)
    r1 = pm.launch(base="bot", command=sys.executable,
                   flags=[], extra_args=["-c", "import time; time.sleep(2)"], cwd=".")
    r2 = pm.launch(base="bot", command=sys.executable,
                   flags=[], extra_args=["-c", "import time; time.sleep(2)"], cwd=".")
    assert r1["name"] == "bot"
    assert r2["name"] == "bot-2"
    assert len(pm.list_managed()) == 2
    pm.stop("bot")
    pm.stop("bot-2")
    pm.shutdown()
    import shutil
    shutil.rmtree("./test_data", ignore_errors=True)
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd C:\AI\JAgentchattr && .venv\Scripts\python -m pytest tests/test_process_manager.py -v`
Expected: FAIL with "No module named 'process_manager'"

- [x] **Step 3: Write ProcessManager implementation**

Create `process_manager.py` with:
- `ManagedAgent` class: holds subprocess, ring buffer (deque maxlen=100), state machine (starting/running/crashed/stopped), reader thread for stdout, waiter thread for exit detection
- `AGENT_FLAG_PRESETS` dict: known flag toggles per agent type (claude, codex, gemini, qwen)
- `ProcessManager` class: launch (spawn subprocess, assign unique name), stop (SIGTERM then SIGKILL after 5s), get_logs, list_managed, get_restore_state, clear_restore_state, shutdown
- Launch state persisted to `data/launch_state.json` on every launch/stop

Key implementation details:
- `launch()` uses `subprocess.Popen` with `stdout=PIPE, stderr=STDOUT` — no `shell=True`
- For test mode (when command is sys.executable directly), run the command as-is
- For production mode (when called from app.py), build `wrapper.py` command with `--no-restart` flag
- Name assignment: first instance gets base name, subsequent get base-2, base-3, etc.
- `on_log` callback (optional) called from reader thread for each line — used for WebSocket broadcast

- [x] **Step 4: Run tests to verify they pass**

Run: `cd C:\AI\JAgentchattr && .venv\Scripts\python -m pytest tests/test_process_manager.py -v`
Expected: 2 passed

- [x] **Step 5: Commit**

```bash
git add process_manager.py tests/test_process_manager.py
git commit -m "feat(launcher): add ProcessManager for server-managed agent subprocesses"
```

---

### Task 2: Agent Definitions Store

**Files:**
- Modify: `config_loader.py`
- Create: `tests/test_agent_definitions.py`

- [x] **Step 1: Write the failing test**

```python
# tests/test_agent_definitions.py
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from config_loader import load_agent_definitions, save_agent_definition, delete_agent_definition


def test_load_definitions_merges_with_config(tmp_path):
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    (data_dir / "agent_definitions.json").write_text(json.dumps({
        "mybot": {"command": "mybot", "color": "#ff0000", "label": "MyBot"}
    }))
    config_agents = {"claude": {"command": "claude", "color": "#da7756", "label": "Claude"}}
    defs = load_agent_definitions(data_dir, config_agents)
    assert "claude" in defs
    assert "mybot" in defs
    assert defs["mybot"]["color"] == "#ff0000"


def test_save_and_delete_definition(tmp_path):
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    save_agent_definition(data_dir, "newbot", {"command": "newbot", "color": "#00ff00", "label": "NewBot"})
    defs = load_agent_definitions(data_dir, {})
    assert "newbot" in defs

    delete_agent_definition(data_dir, "newbot")
    defs = load_agent_definitions(data_dir, {})
    assert "newbot" not in defs
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd C:\AI\JAgentchattr && .venv\Scripts\python -m pytest tests/test_agent_definitions.py -v`
Expected: FAIL with "cannot import name 'load_agent_definitions'"

- [x] **Step 3: Add functions to config_loader.py**

Add `import json` at the top, then add three functions at the end:
- `load_agent_definitions(data_dir, config_agents)` — merges config.toml agents with `data/agent_definitions.json` (config.toml wins on conflicts)
- `save_agent_definition(data_dir, name, definition)` — upsert to JSON file
- `delete_agent_definition(data_dir, name)` — remove from JSON file

- [x] **Step 4: Run tests to verify they pass**

Run: `cd C:\AI\JAgentchattr && .venv\Scripts\python -m pytest tests/test_agent_definitions.py -v`
Expected: 2 passed

- [x] **Step 5: Commit**

```bash
git add config_loader.py tests/test_agent_definitions.py
git commit -m "feat(launcher): add agent definitions CRUD to config_loader"
```

---

### Task 3: REST API Endpoints and Server Wiring

**Files:**
- Modify: `app.py` (add global at line ~42, add `default_cwd` to room_settings at line ~50, add WS init data at line ~1138, add endpoints after line ~2695)
- Modify: `run.py` (create ProcessManager after configure() call at line ~36)

- [x] **Step 1: Add ProcessManager global to app.py**

After `session_engine` global (line 42), add:
```python
process_manager = None  # set by run.py
```

Add `"default_cwd": ""` to `room_settings` dict (line ~50).

- [x] **Step 2: Wire ProcessManager creation in run.py**

After `configure()` call and data_dir setup, create ProcessManager with `on_log` callback that broadcasts via WebSocket.

- [x] **Step 3: Add REST endpoints to app.py**

Add after the last endpoint (~line 2695):
- `POST /api/agents/{base}/launch` — spawn wrapper subprocess via ProcessManager
- `POST /api/agents/{name}/stop` — stop a managed agent
- `GET /api/agents/{name}/logs` — return log ring buffer
- `GET /api/agents/managed` — list all managed processes
- `GET /api/agent-definitions` — list definitions + flag presets
- `POST /api/agent-definitions` — add user-defined agent
- `DELETE /api/agent-definitions/{name}` — remove user-defined agent
- `GET /api/agents/restore` — get previous session state
- `POST /api/agents/restore/dismiss` — clear restore state

All endpoints use session token auth (existing middleware handles this).

- [x] **Step 4: Send managed agent state and restore data on WS connect**

In the WebSocket handler, after sending schedules (~line 1138), add sends for `agent_processes` and `session_restore` events.

- [x] **Step 5: Verify syntax**

Run: `cd C:\AI\JAgentchattr && .venv\Scripts\python -c "import ast; ast.parse(open('app.py').read()); ast.parse(open('run.py').read()); print('OK')"`
Expected: OK

- [x] **Step 6: Commit**

```bash
git add app.py run.py
git commit -m "feat(launcher): add REST endpoints and ProcessManager wiring"
```

---

### Task 4: Frontend — Launcher Panel HTML, JS, and CSS

**Files:**
- Modify: `static/index.html` (header button, panel container, launcher asset links)
- Create: `static/launcher.js`
- Create: `static/launcher.css`

- [x] **Step 1: Add launcher button to header in index.html**

After the `agent-status` div (line 25), before `jobs-toggle` button (line 26), add a new button with a lattice/terminal icon and id `launcher-toggle`.

- [x] **Step 2: Add panel container in index.html**

Before `pins-panel` (line 126), add `<aside id="launcher-panel" class="hidden">` with header, list div, and add-agent form div.

- [x] **Step 3: Add script tag**

After `rules-panel.js` (line 327): `<script src="/static/launcher.js?v=100"></script>`

- [x] **Step 4: Create launcher.js**

Module pattern matching jobs.js:
- State: `launcherDefinitions`, `launcherFlagPresets`, `launcherProcesses`, `launcherLogs`, `launcherLogsOpen`, `launcherConfigOpen`
- Init: fetch definitions and managed agents on DOMContentLoaded
- Hub subscriptions: `agent_processes` (re-render panel), `agent_log` (append to buffer, re-render logs), `session_restore` (show banner)
- Functions: `toggleLauncherPanel`, `renderLauncherPanel`, `buildAgentCard`, `buildLaunchConfig`, `launchAgent`, `stopAgent`, `toggleLaunchConfig`, `toggleAgentLogs`, `fetchAgentLogs`, `renderAgentLogs`
- Add Agent: `toggleAddAgentForm`, `saveNewAgent` with colour picker
- Session Restore: `showRestoreBanner`, `relaunchSelected`, `dismissRestore`
- All user content rendered via `escapeHtml()` (from core.js) — no raw innerHTML with untrusted data

Note on XSS: All dynamic content inserted via innerHTML uses `escapeHtml()` for user-provided strings (agent names, flags, paths). This follows the existing pattern used by jobs.js and sessions.js in this codebase.

- [x] **Step 5: Add CSS styles in `static/launcher.css` and link them from `static/index.html`**

Add launcher panel styles matching the mockup: panel positioning, card layout, dot indicators, status badges, launch config form, flag toggles, log viewer, add-agent form, colour picker, restore banner.

- [x] **Step 6: Commit**

```bash
git add static/index.html static/launcher.js
git commit -m "feat(launcher): add launcher panel UI with agent cards, logs, and forms"
```

---

### Task 5: WebSocket Event Routing in chat.js

**Files:**
- Modify: `static/chat.js` (ws.onmessage handler, around lines 487-630)

- [x] **Step 1: Add event routing**

After the `schedule` case (line ~628), add:
```javascript
    } else if (event.type === "agent_processes") {
      Hub.emit("agent_processes", event);
    } else if (event.type === "agent_log") {
      Hub.emit("agent_log", event);
    } else if (event.type === "session_restore") {
      Hub.emit("session_restore", event);
```

- [x] **Step 2: Commit**

```bash
git add static/chat.js
git commit -m "feat(launcher): route launcher WS events through Hub"
```

---

### Task 6: Integration Tests

**Files:**
- Create: `tests/test_launcher_api.py`

- [x] **Step 1: Write integration tests**

Tests using Starlette TestClient:
- `test_list_definitions` — GET /api/agent-definitions returns definitions and flag_presets
- `test_add_and_delete_definition` — POST then DELETE agent definition
- `test_list_managed_empty` — GET /api/agents/managed returns empty list initially

All requests use cookie auth: `cookies={"session": "test-token"}`

- [x] **Step 2: Run tests**

Run: `cd C:\AI\JAgentchattr && .venv\Scripts\python -m pytest tests/test_launcher_api.py -v`
Expected: 3 passed

- [x] **Step 3: Commit**

```bash
git add tests/test_launcher_api.py
git commit -m "test(launcher): add integration tests for launcher API endpoints"
```

---

### Task 7: Manual Testing and Polish

**Status note (2026-04-12):** The automated Windows QA gate has been recorded, the launcher smoke now covers explicit custom-agent stop/delete cleanup, and a startup race in `electron/renderer/renderer.js` was fixed during that run. These checklist items are now optional native-desktop spot checks rather than release blockers.

- [ ] **Step 1: Start the server and open browser**

Run: `cd C:\AI\JAgentchattr && .venv\Scripts\python run.py`
Navigate to http://localhost:8300

- [ ] **Step 2: Verify panel functionality**

Check: launcher button in header, panel opens/closes, definitions listed, add agent form works, launch config expands with flag toggles, no JS errors in console.

- [ ] **Step 3: Test agent launch and stop**

Launch an agent from the panel. Verify: registration, status pills, logs, stop button. Launch a second instance of the same agent — verify it gets a suffix name.

- [ ] **Step 4: Test session restore**

Stop server, restart it, verify restore banner appears with previous agents listed.

- [ ] **Step 5: Commit any fixes**

```bash
git add <specific files>
git commit -m "fix(launcher): polish from manual testing"
```

---

## Summary

| Task | Description | Est. Steps |
|------|-------------|------------|
| 1 | ProcessManager core | 5 |
| 2 | Agent definitions store | 5 |
| 3 | REST API + server wiring | 6 |
| 4 | Frontend panel (HTML + JS + CSS) | 6 |
| 5 | WS event routing | 2 |
| 6 | Integration tests | 3 |
| 7 | Manual testing + polish | 5 |
| **Total** | | **32 steps** |
