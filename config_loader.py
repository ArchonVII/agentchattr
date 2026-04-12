"""Shared config loader — merges config.toml + config.local.toml.

Used by run.py, wrapper.py, and wrapper_api.py so the server and all
wrappers see the same agent definitions.
"""

import json
import tomllib
from pathlib import Path

ROOT = Path(__file__).parent


def load_config(root: Path | None = None) -> dict:
    """Load config.toml and merge config.local.toml if it exists.

    config.local.toml is gitignored and intended for user-specific agents
    (e.g. local LLM endpoints) that shouldn't be committed.
    Only the [agents] section is merged — local entries are added alongside
    (not replacing) the agents defined in config.toml.
    """
    root = root or ROOT
    config_path = root / "config.toml"

    with open(config_path, "rb") as f:
        config = tomllib.load(f)

    local_path = root / "config.local.toml"
    if local_path.exists():
        with open(local_path, "rb") as f:
            local = tomllib.load(f)
        
        # Merge [agents] section — local agents are added ONLY if they don't already exist.
        # This protects the "holy trinity" (claude, codex, gemini) from being overridden.
        local_agents = local.get("agents", {})
        config_agents = config.setdefault("agents", {})
        for name, agent_cfg in local_agents.items():
            if name not in config_agents:
                config_agents[name] = agent_cfg
            else:
                print(f"  Warning: Ignoring local agent '{name}' (already defined in config.toml)")

    config_agents = config.setdefault("agents", {})
    data_dir = Path(config.get("server", {}).get("data_dir", "./data"))
    if not data_dir.is_absolute():
        data_dir = root / data_dir
    config["agents"] = load_agent_definitions(data_dir, config_agents)

    return config


def load_agent_definitions(data_dir: Path, config_agents: dict) -> dict:
    """Merge config.toml agents with user-defined agents from agent_definitions.json.

    config.toml agents win on name conflicts (same protection as config.local.toml).
    """
    merged = dict(config_agents)
    defs_path = data_dir / "agent_definitions.json"
    if defs_path.exists():
        try:
            user_defs = json.loads(defs_path.read_text("utf-8"))
            for name, agent_cfg in user_defs.items():
                if name not in merged:
                    merged[name] = agent_cfg
        except Exception:
            pass
    return merged


def save_agent_definition(data_dir: Path, name: str, definition: dict):
    """Save or update a user-defined agent definition."""
    defs_path = data_dir / "agent_definitions.json"
    defs_path.parent.mkdir(parents=True, exist_ok=True)
    existing = {}
    if defs_path.exists():
        try:
            existing = json.loads(defs_path.read_text("utf-8"))
        except Exception:
            pass
    existing[name] = definition
    defs_path.write_text(json.dumps(existing, indent=2), "utf-8")


def delete_agent_definition(data_dir: Path, name: str):
    """Remove a user-defined agent definition."""
    defs_path = data_dir / "agent_definitions.json"
    if not defs_path.exists():
        return
    try:
        existing = json.loads(defs_path.read_text("utf-8"))
        existing.pop(name, None)
        defs_path.write_text(json.dumps(existing, indent=2), "utf-8")
    except Exception:
        pass
