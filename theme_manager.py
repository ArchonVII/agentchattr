"""ThemeManager — loads theme_snapshot.json and builds Rich themes.

Converts CSS hex values from the Electron theme system into Rich style
objects for themed terminal output.

Source: CSS-to-ANSI Translation Layer spec, Section 5.1.
"""

import json
import os
from pathlib import Path

from rich.console import Console
from rich.theme import Theme

import re

ROOT = Path(__file__).parent
SNAPSHOT_PATH = ROOT / "data" / "theme_snapshot.json"

# Rich box style names per theme.
# Source: spec Section 5.3.
# Pattern matching 3-char hex shorthand (#abc -> #aabbcc).
# Rich requires full 6-digit hex codes.
_SHORT_HEX_RE = re.compile(r"^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$")


def _expand_hex(color: str) -> str:
    """Expand 3-char hex shorthand to 6-char for Rich compatibility.

    Source: CSS Color Level 4 spec — shorthand expansion rule.
    """
    m = _SHORT_HEX_RE.match(color)
    if m:
        return f"#{m[1]*2}{m[2]*2}{m[3]*2}"
    return color


_BOX_STYLES = {
    "default": "ROUNDED",
    "nes": "HEAVY",
    "win98": "DOUBLE",
    "system6": "SQUARE",
    "c64": "HEAVY",
}


class ThemeManager:
    """Loads the theme snapshot and builds Rich Theme objects."""

    def __init__(self, snapshot_path: Path | None = None):
        self._path = snapshot_path or SNAPSHOT_PATH
        self._snapshot = self._load()
        self.active_theme_id = os.environ.get("AGENTCHATTR_THEME", "default")

    def _load(self) -> dict:
        if not self._path.exists():
            return {"themes": {}}
        return json.loads(self._path.read_text("utf-8"))

    def get_theme_data(self, theme_id: str) -> dict | None:
        """Return raw theme data dict for a given theme ID."""
        return self._snapshot.get("themes", {}).get(theme_id)

    def get_rich_theme(self, theme_id: str | None = None) -> Theme:
        """Build a Rich Theme from the snapshot's CSS hex values.

        Maps CSS variables to Rich style names using hex colour syntax.
        Source: spec Section 5.1 — style mapping table.
        """
        tid = theme_id or self.active_theme_id
        data = self.get_theme_data(tid)
        if not data:
            data = self.get_theme_data("default") or {"css": {}}

        css = data.get("css", {})
        # Helper to fetch a CSS value with fallback, expanding 3-char hex.
        def c(key: str, fallback: str) -> str:
            return _expand_hex(css.get(key, fallback))

        styles = {
            "ui.surface": c("bg_surface", "#1a1a2e"),
            "ui.header": f"bold {c('fg_primary', '#e0e0e0')} on {c('bg_deep', '#171726')}",
            "ui.text": c("fg_primary", "#e0e0e0"),
            "ui.muted": c("fg_muted", "#888888"),
            "ui.accent": f"bold {c('accent', '#da7756')}",
            "ui.success": f"bold {c('accent_success', '#4ade80')}",
            "ui.danger": f"bold {c('accent_danger', '#ff6b6b')}",
            "ui.border": c("border", "#2a2a3a"),
            "ui.border_strong": c("border_strong", "#3a3a4a"),
        }
        return Theme(styles)

    def get_console(self, theme_id: str | None = None) -> Console:
        """Return a Rich Console instance wired to the given theme."""
        rich_theme = self.get_rich_theme(theme_id)
        return Console(theme=rich_theme)

    def get_box_style(self, theme_id: str | None = None) -> str:
        """Return the Rich box constant name for the theme.

        Source: spec Section 5.3 — box style per theme.
        """
        tid = theme_id or self.active_theme_id
        data = self.get_theme_data(tid)
        if data and "richBox" in data:
            return data["richBox"]
        return _BOX_STYLES.get(tid, "ROUNDED")

    def get_error_icon(self, theme_id: str | None = None) -> str:
        """Return the era-appropriate error icon string.

        Source: spec Section 3.4 — interaction metadata.
        """
        tid = theme_id or self.active_theme_id
        data = self.get_theme_data(tid)
        if data:
            return data.get("errorIcon", "x")
        return "x"

    def get_banner_font(self, theme_id: str | None = None) -> str:
        """Return the FIGlet font name for the startup banner.

        Source: spec Section 3.2 — layout metadata.
        """
        tid = theme_id or self.active_theme_id
        data = self.get_theme_data(tid)
        if data:
            return data.get("bannerFont", "slant")
        return "slant"

    def get_effects(self, theme_id: str | None = None) -> dict:
        """Return the effects dict for the theme.

        Source: spec Section 3.3 — CRT simulation.
        """
        tid = theme_id or self.active_theme_id
        data = self.get_theme_data(tid)
        if data:
            return data.get("effects", {})
        return {}

    def get_current_theme(self) -> dict:
        """Return the active theme's full data (for the /api/theme endpoint)."""
        data = self.get_theme_data(self.active_theme_id)
        return {
            "id": self.active_theme_id,
            "theme": data,
        }


# Module-level singleton — imported by theme_console.py and other modules.
_manager: ThemeManager | None = None


def get_manager() -> ThemeManager:
    """Return the singleton ThemeManager, creating it on first call."""
    global _manager
    if _manager is None:
        _manager = ThemeManager()
    return _manager


def get_current_theme() -> dict:
    """Convenience wrapper for the /api/theme endpoint."""
    return get_manager().get_current_theme()
