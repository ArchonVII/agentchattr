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


def test_managed_and_restore_state_include_base_metadata():
    """Managed agents and restore state preserve the originating base name."""
    pm = ProcessManager(data_dir=Path("./test_data"), server_port=8300)
    pm.launch(
        base="bot",
        command=sys.executable,
        flags=[],
        extra_args=["-c", "import time; time.sleep(2)"],
        cwd=".",
    )
    pm.launch(
        base="bot",
        command=sys.executable,
        flags=[],
        extra_args=["-c", "import time; time.sleep(2)"],
        cwd=".",
        instance_label="review-bot",
    )

    managed = sorted(pm.list_managed(), key=lambda item: item["name"])
    assert managed[0]["base"] == "bot"
    assert managed[1]["base"] == "bot"
    assert managed[0]["started_at"] > 0
    assert managed[1]["started_at"] > 0

    restore = sorted(pm.get_restore_state(), key=lambda item: item["name"])
    assert restore[0]["base"] == "bot"
    assert restore[1]["base"] == "bot"
    assert restore[0]["started_at"] > 0
    assert restore[1]["started_at"] > 0

    pm.stop("bot")
    pm.stop("review-bot")
    pm.shutdown()
    import shutil
    shutil.rmtree("./test_data", ignore_errors=True)


def test_restore_state_keeps_relaunchable_user_args_from_wrapper_invocation():
    """Restore state should keep the user-facing args, not the raw wrapper invocation."""
    pm = ProcessManager(data_dir=Path("./test_data"), server_port=8300)
    wrapper_path = str(ROOT / "wrapper.py")
    pm.launch(
        base="bot",
        command=sys.executable,
        flags=[],
        extra_args=[
            wrapper_path,
            "bot",
            "--no-restart",
            "--label",
            "review-bot",
            "--",
            "--dangerously-skip-permissions",
            "--model",
            "claude sonnet",
            "--json",
        ],
        cwd=".",
        instance_label="review-bot",
    )

    restore = pm.get_restore_state()
    assert len(restore) == 1
    assert restore[0]["base"] == "bot"
    assert restore[0]["instance_label"] == "review-bot"
    assert restore[0]["flags"] == []
    assert restore[0]["extra_args"] == [
        "--dangerously-skip-permissions",
        "--model",
        "claude sonnet",
        "--json",
    ]

    pm.stop("review-bot")
    pm.shutdown()
    import shutil
    shutil.rmtree("./test_data", ignore_errors=True)
