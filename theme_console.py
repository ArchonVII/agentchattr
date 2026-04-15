"""theme_console — Global Rich console + themed rendering helpers.

Provides a pre-configured Rich Console and convenience functions for
rendering panels, errors, banners, and warnings using the active theme.

Source: CSS-to-ANSI Translation Layer spec, Section 5.2.
"""

from rich import box as rich_box
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from theme_manager import get_manager

try:
    import pyfiglet
except ImportError:
    pyfiglet = None

# ---------------------------------------------------------------------------
# Box style resolver
# ---------------------------------------------------------------------------

_BOX_MAP = {
    "ROUNDED": rich_box.ROUNDED,
    "HEAVY": rich_box.HEAVY,
    "DOUBLE": rich_box.DOUBLE,
    "SQUARE": rich_box.SQUARE,
}


def _get_box():
    """Return the Rich box object for the active theme."""
    name = get_manager().get_box_style()
    return _BOX_MAP.get(name, rich_box.ROUNDED)


# ---------------------------------------------------------------------------
# Module-level console singleton
# ---------------------------------------------------------------------------

console: Console = get_manager().get_console()


# ---------------------------------------------------------------------------
# Rendering helpers
# ---------------------------------------------------------------------------

def _error_icon_char() -> str:
    """Return the era-appropriate error icon character.

    Source: spec Section 3.4 — interaction metadata.
    """
    # Icon mapping from theme errorIcon strings to Unicode characters.
    # Source: CSS-to-ANSI Translation Layer spec, Section 3.4.
    icon_map = {
        "bomb": "\U0001F4A3",    # bomb — System 6
        "stop": "\U0001F6D1",    # stop — Win98, C64
        "skull": "\u2620",       # skull — Hacker/BBS
        "x": "\u2716",           # x — Default (modern)
    }
    icon_name = get_manager().get_error_icon()
    return icon_map.get(icon_name, "\u2716")


def render_panel(title: str, content: str, style: str = "ui.border",
                 console: Console | None = None):
    """Render a themed Rich Panel.

    Args:
        title: Panel title (displayed in the border).
        content: Body text.
        style: Rich style name for the border.
        console: Override console (for testing). Uses module singleton if None.
    """
    c = console or globals()["console"]
    c.print(Panel(
        content,
        title=f"[ui.accent]{title}[/ui.accent]",
        border_style=style,
        box=_get_box(),
        expand=False,
        padding=(1, 2),
    ))


def render_error(title: str, message: str, console: Console | None = None):
    """Render a themed error dialogue panel with era-appropriate icon.

    Styled with ui.danger border to look like a system error window.
    Source: spec Section 5.5.
    """
    c = console or globals()["console"]
    icon = _error_icon_char()
    c.print(Panel(
        f"[ui.danger]{message}[/ui.danger]",
        title=f"[ui.danger]{icon} {title}[/ui.danger]",
        border_style="ui.danger",
        box=_get_box(),
        expand=False,
        padding=(1, 2),
    ))


def render_banner(info: dict, console: Console | None = None):
    """Render the server startup banner with FIGlet art and a details table.

    Uses the active theme's bannerFont for the ASCII art header.
    Args:
        info: Dict with keys: host, port, http_port, sse_port, session_token, label.
    Source: spec Section 5.4 — replaces the plain print() block in run.py.
    """
    c = console or globals()["console"]

    # FIGlet banner — falls back to plain text if pyfiglet unavailable
    banner_font = get_manager().get_banner_font()
    if pyfiglet:
        try:
            art = pyfiglet.figlet_format("agentchattr", font=banner_font)
            c.print(f"[ui.accent]{art}[/ui.accent]", highlight=False)
        except Exception:
            c.print("[ui.accent]agentchattr[/ui.accent]")
    else:
        c.print("[ui.accent]agentchattr[/ui.accent]")

    table = Table(show_header=False, box=None, padding=(0, 2))
    table.add_column("key", style="ui.muted")
    table.add_column("value", style="ui.text")

    table.add_row("Web UI", f"http://{info['host']}:{info['port']}")
    table.add_row("MCP HTTP", f"http://{info['host']}:{info['http_port']}/mcp")
    table.add_row("MCP SSE", f"http://{info['host']}:{info['sse_port']}/sse")
    table.add_row("Build", info.get("label", ""))
    table.add_row("Token", info.get("session_token", ""))

    c.print(Panel(
        table,
        subtitle="[ui.muted]agents auto-trigger on @mention[/ui.muted]",
        border_style="ui.accent",
        box=_get_box(),
        expand=False,
        padding=(1, 2),
    ))
    c.print()


def render_security_warning(host: str, console: Console | None = None):
    """Render the security warning as a danger-styled panel.

    Source: spec Section 5.4 — replaces the plain print() block in run.py.
    """
    c = console or globals()["console"]

    warning_text = (
        f"[ui.danger]Binding to {host}[/ui.danger]\n"
        "This exposes agentchattr to your local network.\n\n"
        "[ui.text]Risks:[/ui.text]\n"
        "  - No TLS: traffic (including session token) is plaintext\n"
        "  - Anyone on your network can sniff the token and gain full access\n"
        "  - With the token, anyone can @mention agents and trigger tool execution\n"
        "  - If agents run with auto-approve, this means remote code execution\n\n"
        "Only use this on a trusted home network. Never on public/shared WiFi."
    )

    c.print()
    c.print(Panel(
        warning_text,
        title="[ui.danger]SECURITY WARNING[/ui.danger]",
        border_style="ui.danger",
        box=_get_box(),
        expand=False,
        padding=(1, 2),
    ))
