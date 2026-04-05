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
