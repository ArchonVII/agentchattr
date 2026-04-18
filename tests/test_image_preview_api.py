"""Tests for resolving local image references into chat-previewable URLs."""

import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from config_loader import load_config
from app import app, configure
from image_path_resolver import resolve_image_reference
from starlette.testclient import TestClient

COOKIES = {"session": "test-token"}
client: TestClient
tmpdir: Path


def setup_module():
    global client, tmpdir
    tmpdir = Path(tempfile.mkdtemp())
    (tmpdir / "data").mkdir(exist_ok=True)
    (tmpdir / "uploads").mkdir(exist_ok=True)

    (tmpdir / "config.toml").write_text(
        '[server]\nport = 8399\ndata_dir = "./data"\n\n'
        '[images]\nupload_dir = "./uploads"\n',
        encoding="utf-8",
    )

    cfg = load_config(root=tmpdir)
    configure(cfg, session_token="test-token")
    client = TestClient(app)
    client.cookies.set("session", "test-token")


def test_resolve_image_preview_returns_cached_upload_url_for_absolute_image():
    source = tmpdir / "capture.png"
    source.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        b"\x00\x00\x00\rIHDR"
        b"\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00"
        b"\x90wS\xde"
        b"\x00\x00\x00\x0cIDATx\x9cc```\x00\x00\x00\x04\x00\x01"
        b"\x0b\xe7\x02\x9d"
        b"\x00\x00\x00\x00IEND\xaeB`\x82"
    )

    response = client.post(
        "/api/image-previews/resolve",
        json={"refs": [str(source)]},
    )

    assert response.status_code == 200
    body = response.json()
    assert len(body["results"]) == 1
    assert body["results"][0]["name"] == "capture.png"
    assert body["results"][0]["url"].startswith("/uploads/")


def test_resolve_image_reference_supports_screenshot_basenames_from_partial_mentions():
    home_dir = tmpdir / "fake-home"
    screenshots_dir = home_dir / "Pictures" / "Screenshots"
    screenshots_dir.mkdir(parents=True, exist_ok=True)
    source = screenshots_dir / "Screenshot 2026-04-18 153000.png"
    source.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        b"\x00\x00\x00\rIHDR"
        b"\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00"
        b"\x90wS\xde"
        b"\x00\x00\x00\x0cIDATx\x9cc```\x00\x00\x00\x04\x00\x01"
        b"\x0b\xe7\x02\x9d"
        b"\x00\x00\x00\x00IEND\xaeB`\x82"
    )

    resolved = resolve_image_reference(
        source.name,
        upload_dir=tmpdir / "uploads",
        project_root=ROOT,
        home_dir=home_dir,
    )

    assert resolved is not None
    assert resolved["name"] == source.name
    assert resolved["url"].startswith("/uploads/")
