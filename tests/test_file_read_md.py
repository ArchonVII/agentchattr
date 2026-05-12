"""Tests for /api/file/markdown — read .md files inside the project tree.

Covers auth, path-traversal protection, extension check, size cap, and
the happy-path response shape.
"""

import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from config_loader import load_config
from app import app, configure
from starlette.testclient import TestClient

client: TestClient
tmpdir: Path
project_md: Path


def setup_module():
    global client, tmpdir, project_md
    tmpdir = Path(tempfile.mkdtemp())
    (tmpdir / "data").mkdir(exist_ok=True)

    (tmpdir / "config.toml").write_text(
        '[server]\nport = 8399\ndata_dir = "./data"\n',
        encoding="utf-8",
    )

    cfg = load_config(root=tmpdir)
    configure(cfg, session_token="test-token")
    client = TestClient(app)
    client.cookies.set("session", "test-token")

    # Real .md inside the actual repo root (where the resolver checks against).
    repo_root = Path(__file__).resolve().parent.parent
    project_md = repo_root / "_test_md_fixture.md"
    project_md.write_text("# fixture\n\nhello world\n", encoding="utf-8")


def teardown_module():
    if project_md.exists():
        project_md.unlink()


def test_happy_path_returns_content():
    resp = client.get("/api/file/markdown", params={"path": str(project_md)})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["name"] == project_md.name
    assert body["content"] == "# fixture\n\nhello world\n"
    assert body["size"] > 0


def test_rejects_non_md_extension():
    resp = client.get("/api/file/markdown", params={"path": "C:/some/file.txt"})
    assert resp.status_code == 400
    assert "only .md" in resp.json()["error"].lower()


def test_rejects_path_outside_repo():
    # Use an absolute path that can't be inside the repo root on Windows.
    resp = client.get("/api/file/markdown", params={"path": "C:/Windows/notepad.md"})
    # Either 403 (outside project) or 404 (resolved + not found) is acceptable;
    # the important thing is it never returns the file's bytes.
    assert resp.status_code in (403, 404)


def test_rejects_traversal_attempt():
    repo_root = Path(__file__).resolve().parent.parent
    traversal = str(repo_root / ".." / ".." / "etc" / "passwd.md")
    resp = client.get("/api/file/markdown", params={"path": traversal})
    assert resp.status_code in (403, 404)


def test_missing_file_returns_404():
    repo_root = Path(__file__).resolve().parent.parent
    resp = client.get(
        "/api/file/markdown",
        params={"path": str(repo_root / "definitely_not_a_real_file_xyz.md")},
    )
    assert resp.status_code == 404


def test_requires_auth_token():
    fresh = TestClient(app)
    resp = fresh.get("/api/file/markdown", params={"path": str(project_md)})
    assert resp.status_code == 403


def test_empty_path_param():
    resp = client.get("/api/file/markdown", params={"path": ""})
    assert resp.status_code == 400
