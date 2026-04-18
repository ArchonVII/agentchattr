"""Resolve chat-mentioned image paths into server-previewable upload URLs."""

from __future__ import annotations

import hashlib
import re
import shutil
from pathlib import Path

IMAGE_SUFFIXES = frozenset({".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"})
_UPLOAD_PREFIX_RE = re.compile(r"^(?:/)?uploads[\\/](.+)$", re.IGNORECASE)
_LINE_SUFFIX_RE = re.compile(r"(\.[A-Za-z0-9]{1,10}):\d+$")


def normalize_image_reference(raw: str) -> str:
    ref = str(raw or "").strip()
    if not ref:
        return ""
    ref = ref.strip("\"'`<>[]()")
    ref = _LINE_SUFFIX_RE.sub(r"\1", ref)
    ref = ref.rstrip(".,;")
    return ref.strip()


def _is_supported_image(path: Path) -> bool:
    return path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES


def _safe_join(root: Path, relative: str) -> Path | None:
    try:
        candidate = (root / relative).resolve()
    except OSError:
        return None
    try:
        candidate.relative_to(root.resolve())
    except ValueError:
        return None
    return candidate


def _materialize_preview(candidate: Path, upload_dir: Path, ref: str) -> dict | None:
    candidate = candidate.resolve()
    if not _is_supported_image(candidate):
        return None

    upload_dir.mkdir(parents=True, exist_ok=True)

    try:
        candidate.relative_to(upload_dir.resolve())
        return {
            "candidate": ref,
            "name": candidate.name,
            "url": f"/uploads/{candidate.name}",
            "source_path": str(candidate),
        }
    except ValueError:
        pass

    stat = candidate.stat()
    cache_key = hashlib.sha1(
        f"{candidate}|{stat.st_mtime_ns}|{stat.st_size}".encode("utf-8"),
    ).hexdigest()[:16]
    cached_name = f"inline-{cache_key}{candidate.suffix.lower()}"
    cached_path = upload_dir / cached_name
    if not cached_path.exists():
        shutil.copy2(candidate, cached_path)

    return {
        "candidate": ref,
        "name": candidate.name,
        "url": f"/uploads/{cached_name}",
        "source_path": str(candidate),
    }


def resolve_image_reference(
    ref: str,
    *,
    upload_dir: Path,
    project_root: Path,
    screenshots_dir: Path | None = None,
    home_dir: Path | None = None,
) -> dict | None:
    normalized = normalize_image_reference(ref)
    if not normalized:
        return None

    lower = normalized.lower()
    if lower.startswith(("http://", "https://", "data:", "javascript:")):
        return None

    project_root = project_root.resolve()
    upload_dir = upload_dir.resolve()
    home_dir = (home_dir or Path.home()).resolve()
    screenshots_dir = (
        screenshots_dir.resolve()
        if screenshots_dir is not None
        else (home_dir / "Pictures" / "Screenshots").resolve()
    )

    upload_match = _UPLOAD_PREFIX_RE.match(normalized.replace("/", "\\"))
    if upload_match:
        candidate = _safe_join(upload_dir, upload_match.group(1))
        if candidate:
            return _materialize_preview(candidate, upload_dir, normalized)

    raw_path = Path(normalized)
    if raw_path.is_absolute():
        return _materialize_preview(raw_path, upload_dir, normalized)

    for root in (project_root, upload_dir, screenshots_dir, home_dir):
        candidate = _safe_join(root, normalized)
        if candidate:
            resolved = _materialize_preview(candidate, upload_dir, normalized)
            if resolved:
                return resolved

    basename = Path(normalized.replace("\\", "/")).name
    if basename and basename != normalized:
        for root in (screenshots_dir, upload_dir):
            candidate = _safe_join(root, basename)
            if candidate:
                resolved = _materialize_preview(candidate, upload_dir, normalized)
                if resolved:
                    return resolved

    return None


def resolve_image_references(
    refs: list[str],
    *,
    upload_dir: Path,
    project_root: Path,
    screenshots_dir: Path | None = None,
    home_dir: Path | None = None,
    limit: int = 8,
) -> list[dict]:
    results: list[dict] = []
    seen: set[str] = set()
    for raw_ref in refs[:limit]:
        resolved = resolve_image_reference(
            raw_ref,
            upload_dir=upload_dir,
            project_root=project_root,
            screenshots_dir=screenshots_dir,
            home_dir=home_dir,
        )
        if not resolved:
            continue
        key = resolved["url"]
        if key in seen:
            continue
        seen.add(key)
        results.append(resolved)
    return results
