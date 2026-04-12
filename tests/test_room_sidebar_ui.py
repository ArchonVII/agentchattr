from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_index_includes_left_room_sidebar_shell():
    html = (ROOT / "static" / "index.html").read_text(encoding="utf-8")

    assert 'id="room-sidebar"' in html
    assert 'id="room-list"' in html
    assert 'id="room-channel-list"' in html
    assert 'id="room-sidebar-toggle"' in html
    assert 'id="presence-panel"' in html
    assert 'id="presence-list"' in html
    assert 'id="presence-panel-toggle"' in html


def test_styles_include_room_sidebar_layout():
    css = (ROOT / "static" / "style.css").read_text(encoding="utf-8")

    assert "#room-sidebar" in css
    assert ".room-nav-item" in css
    assert ".room-channel-item" in css
    assert "#room-sidebar.collapsed" in css
    assert "#presence-panel" in css
    assert ".presence-item" in css
    assert "#presence-panel.collapsed" in css
    assert (
        "@media (max-width: 900px) {\n    #presence-panel {\n        display: none;"
        not in css
    )
