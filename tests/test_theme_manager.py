import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


def test_load_snapshot_returns_all_themes():
    """ThemeManager loads the snapshot and has entries for all 5 app themes."""
    from theme_manager import ThemeManager

    tm = ThemeManager()
    for theme_id in ("default", "nes", "win98", "system6", "c64"):
        theme = tm.get_theme_data(theme_id)
        assert theme is not None, f"missing theme: {theme_id}"
        assert "css" in theme
        assert "ansi" in theme
        assert theme["css"]["bg_app"] is not None


def test_get_rich_theme_returns_theme_object():
    """get_rich_theme() returns a rich.theme.Theme with our custom styles."""
    from theme_manager import ThemeManager

    tm = ThemeManager()
    rich_theme = tm.get_rich_theme("c64")
    assert "ui.surface" in rich_theme.styles
    assert "ui.accent" in rich_theme.styles
    assert "ui.danger" in rich_theme.styles


def test_get_console_returns_console_instance():
    """get_console() returns a Rich Console wired to the theme."""
    from theme_manager import ThemeManager
    from rich.console import Console

    tm = ThemeManager()
    console = tm.get_console("default")
    assert isinstance(console, Console)


def test_default_theme_from_env(monkeypatch):
    """ThemeManager reads AGENTCHATTR_THEME env var for default theme."""
    monkeypatch.setenv("AGENTCHATTR_THEME", "win98")
    from theme_manager import ThemeManager

    tm = ThemeManager()
    assert tm.active_theme_id == "win98"


def test_fallback_to_default_on_missing_env(monkeypatch):
    """ThemeManager falls back to 'default' when env var is not set."""
    monkeypatch.delenv("AGENTCHATTR_THEME", raising=False)
    from theme_manager import ThemeManager

    tm = ThemeManager()
    assert tm.active_theme_id == "default"


def test_get_box_style():
    """get_box_style() returns the correct Rich box constant name."""
    from theme_manager import ThemeManager

    tm = ThemeManager()
    assert tm.get_box_style("c64") == "HEAVY"
    assert tm.get_box_style("win98") == "DOUBLE"
    assert tm.get_box_style("default") == "ROUNDED"


def test_era_metadata_accessible():
    """Era metadata fields are accessible from the theme data."""
    from theme_manager import ThemeManager

    tm = ThemeManager()
    data = tm.get_theme_data("c64")
    assert data["bannerFont"] == "block"
    assert data["glyphSet"] == "petscii"
    assert data["effects"]["scanline_opacity"] == 0.08
    assert data["loaderStyle"] == "classic"
    assert data["errorIcon"] == "stop"
    assert data["focusIndicator"] == "reverse_video"


def test_error_icon():
    """Each theme has an era-appropriate error icon."""
    from theme_manager import ThemeManager

    tm = ThemeManager()
    assert tm.get_theme_data("system6")["errorIcon"] == "bomb"
    assert tm.get_theme_data("default")["errorIcon"] == "x"
