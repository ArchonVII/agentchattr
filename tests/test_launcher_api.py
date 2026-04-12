"""Integration tests for the Agent Launcher REST API endpoints."""

import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from config_loader import load_config
from app import app, configure
import app as app_module
from process_manager import ProcessManager
from starlette.testclient import TestClient

_tmpdir: str = ""
client: TestClient

COOKIES = {"session": "test-token"}


class CaptureProcessManager:
    def __init__(self):
        self.launch_calls = []

    def launch(self, **kwargs):
        self.launch_calls.append(kwargs)
        return {"ok": True, "name": kwargs["base"], "pid": 4242}

    def list_managed(self):
        return []

    def get_restore_state(self):
        return []

    def clear_restore_state(self):
        return None

    def stop(self, name: str):
        return {"ok": True, "name": name}

    def get_logs(self, name: str):
        return []


def setup_module():
    """Create a temp config dir, load config, configure the app, and wire ProcessManager."""
    global _tmpdir, client

    _tmpdir = tempfile.mkdtemp()
    tmp = Path(_tmpdir)

    # Write minimal config.toml
    (tmp / "config.toml").write_text(
        '[server]\nport = 8399\ndata_dir = "./data"\n\n'
        '[agents.testbot]\ncommand = "echo"\ncolor = "#888"\nlabel = "TestBot"\n',
        encoding="utf-8",
    )

    # Ensure data dir exists
    (tmp / "data").mkdir(exist_ok=True)

    cfg = load_config(root=tmp)
    configure(cfg, session_token="test-token")

    # Wire up a real ProcessManager so /api/agents/managed works
    app_module.process_manager = ProcessManager(
        data_dir=tmp / "data",
        server_port=8399,
    )

    client = TestClient(app)


# --------------------------------------------------------------------------
# Tests
# --------------------------------------------------------------------------


def test_list_definitions():
    """GET /api/agent-definitions returns definitions dict and flag_presets dict."""
    resp = client.get("/api/agent-definitions", cookies=COOKIES)
    assert resp.status_code == 200

    body = resp.json()
    assert "definitions" in body
    assert "flag_presets" in body
    assert isinstance(body["definitions"], dict)
    assert isinstance(body["flag_presets"], dict)

    # The testbot from config.toml must appear
    assert "testbot" in body["definitions"]
    assert body["definitions"]["testbot"]["command"] == "echo"
    assert body["definitions"]["testbot"]["label"] == "TestBot"


def test_add_and_delete_definition():
    """POST a new definition, verify it shows up in GET, then DELETE it."""
    new_agent = {
        "name": "mybot",
        "command": "python",
        "label": "MyBot",
        "color": "#ff0000",
    }

    # Add
    resp = client.post("/api/agent-definitions", json=new_agent, cookies=COOKIES)
    assert resp.status_code == 200
    assert resp.json().get("ok") is True

    # Verify it appears in GET
    resp = client.get("/api/agent-definitions", cookies=COOKIES)
    assert resp.status_code == 200
    defs = resp.json()["definitions"]
    assert "mybot" in defs
    assert defs["mybot"]["command"] == "python"
    assert defs["mybot"]["label"] == "MyBot"
    assert defs["mybot"]["color"] == "#ff0000"

    # Delete
    resp = client.delete("/api/agent-definitions/mybot", cookies=COOKIES)
    assert resp.status_code == 200
    assert resp.json().get("ok") is True

    # Verify it is gone
    resp = client.get("/api/agent-definitions", cookies=COOKIES)
    assert resp.status_code == 200
    defs = resp.json()["definitions"]
    assert "mybot" not in defs


def test_list_managed_empty():
    """GET /api/agents/managed returns empty list when no agents are launched."""
    resp = client.get("/api/agents/managed", cookies=COOKIES)
    assert resp.status_code == 200
    assert resp.json() == {"data": []}


def test_launch_endpoint_keeps_agent_flags_after_wrapper_and_tokenizes_extra_args():
    original_pm = app_module.process_manager
    capture_pm = CaptureProcessManager()
    app_module.process_manager = capture_pm

    try:
        resp = client.post(
            "/api/agents/testbot/launch",
            json={
                "cwd": ".",
                "flags": ["--dangerously-skip-permissions"],
                "extra_args": '--model "claude sonnet" --json',
                "instance_label": "review-bot",
            },
            cookies=COOKIES,
        )
    finally:
        app_module.process_manager = original_pm

    assert resp.status_code == 200
    assert resp.json()["ok"] is True
    assert len(capture_pm.launch_calls) == 1

    call = capture_pm.launch_calls[0]
    wrapper_path = str(ROOT / "wrapper.py")
    assert call["command"] == sys.executable
    assert call["flags"] == []
    assert call["extra_args"] == [
        wrapper_path,
        "testbot",
        "--no-restart",
        "--label",
        "review-bot",
        "--",
        "--dangerously-skip-permissions",
        "--model",
        "claude sonnet",
        "--json",
    ]


def test_websocket_continue_resumes_requested_channel():
    app_module.router._get_ch("planning")["paused"] = True
    app_module.router._get_ch("planning")["hop_count"] = 99

    with client.websocket_connect("/ws", cookies=COOKIES) as ws:
        ws.send_text(
            json.dumps(
                {
                    "type": "message",
                    "sender": "user",
                    "text": "/continue",
                    "channel": "planning",
                }
            )
        )

    assert app_module.router.is_paused("planning") is False
    assert app_module.router._get_ch("planning")["hop_count"] == 0
