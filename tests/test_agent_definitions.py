import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from config_loader import (
    delete_agent_definition,
    load_agent_definitions,
    load_config,
    save_agent_definition,
)


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


def test_load_config_includes_user_defined_agents_from_data_dir(tmp_path):
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    (tmp_path / "config.toml").write_text(
        '[server]\ndata_dir = "./data"\n\n'
        '[agents.claude]\ncommand = "claude"\ncolor = "#da7756"\nlabel = "Claude"\n',
        encoding="utf-8",
    )
    (data_dir / "agent_definitions.json").write_text(
        json.dumps(
            {
                "mybot": {
                    "command": "python",
                    "color": "#ff0000",
                    "label": "MyBot",
                    "cwd": "..",
                }
            }
        ),
        encoding="utf-8",
    )

    cfg = load_config(root=tmp_path)

    assert "claude" in cfg["agents"]
    assert "mybot" in cfg["agents"]
    assert cfg["agents"]["mybot"]["command"] == "python"
