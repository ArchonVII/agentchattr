import sys
from pathlib import Path
from io import StringIO

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from theme_manager import get_manager

def _test_console(width=60):
    """Create a test console with the active theme applied."""
    from rich.console import Console
    buf = StringIO()
    return Console(
        file=buf, force_terminal=True, width=width,
        theme=get_manager().get_rich_theme(),
    ), buf


def test_console_is_a_rich_console():
    """The module-level console is a Rich Console instance."""
    from theme_console import console
    from rich.console import Console

    assert isinstance(console, Console)


def test_render_panel_produces_output():
    """render_panel() writes to the console without crashing."""
    from theme_console import render_panel

    test_console, buf = _test_console(60)
    render_panel("Test Title", "Test content", console=test_console)
    output = buf.getvalue()
    assert "Test Title" in output
    assert "Test content" in output


def test_render_error_produces_output():
    """render_error() writes a danger-styled panel."""
    from theme_console import render_error

    test_console, buf = _test_console(60)
    render_error("PROCESS ERROR", "The module 'windows' could not be loaded.", console=test_console)
    output = buf.getvalue()
    assert "PROCESS ERROR" in output
    assert "windows" in output


def test_render_banner_produces_output():
    """render_banner() renders server info in a panel."""
    from theme_console import render_banner

    test_console, buf = _test_console(80)
    info = {
        "host": "127.0.0.1",
        "port": 8300,
        "http_port": 8200,
        "sse_port": 8201,
        "session_token": "abc123",
        "label": "deadbeef - main/JAgentchattr - 2026-04-15",
    }
    render_banner(info, console=test_console)
    output = buf.getvalue()
    assert "8300" in output
    assert "8200" in output


def test_render_security_warning_produces_output():
    """render_security_warning() renders a danger panel."""
    from theme_console import render_security_warning

    test_console, buf = _test_console(80)
    render_security_warning("0.0.0.0", console=test_console)
    output = buf.getvalue()
    assert "SECURITY" in output.upper()
    assert "0.0.0.0" in output
