"""Validation and generation of per-software project publish folder slugs (Git export root)."""

from __future__ import annotations

import re
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Project
from app.services.section_service import slugify_title

PUBLISH_FOLDER_SLUG_MAX_LEN = 128
_PUBLISH_SLUG_RE = re.compile(r"^[\w\-]+$")


def slug_from_project_name(name: str) -> str:
    """Default folder slug from display name (ASCII slug, hyphenated)."""
    base = slugify_title(name.strip() or "project")
    if len(base) > PUBLISH_FOLDER_SLUG_MAX_LEN:
        base = base[:PUBLISH_FOLDER_SLUG_MAX_LEN].rstrip("-") or "project"
    return base or "project"


def coerce_publish_folder_slug_for_create(raw: str | None, *, fallback_name: str) -> str:
    """Resolve optional slug on create: empty uses project name; invalid chars slugify like title."""
    if raw is None or str(raw).strip() == "":
        return slug_from_project_name(fallback_name)
    try:
        return normalize_publish_folder_slug(str(raw))
    except ValueError:
        return slug_from_project_name(str(raw))


def coerce_publish_folder_slug_for_update(raw: str) -> str:
    """Normalize slug on update; slugify if needed."""
    try:
        return normalize_publish_folder_slug(raw)
    except ValueError:
        return slug_from_project_name(raw)


def normalize_publish_folder_slug(raw: str) -> str:
    """
    Normalize user-supplied slug: trim, lowercase, validate charset and length.
    Raises ValueError with a short reason if invalid.
    """
    s = raw.strip().lower()
    if not s:
        raise ValueError("empty")
    if len(s) > PUBLISH_FOLDER_SLUG_MAX_LEN:
        s = s[:PUBLISH_FOLDER_SLUG_MAX_LEN].rstrip("-")
        if not s:
            raise ValueError("empty")
    if not _PUBLISH_SLUG_RE.match(s):
        raise ValueError("invalid_charset")
    return s


def _slug_with_numeric_suffix(base_slug: str, n: int) -> str:
    suffix = f"-{n}"
    root = base_slug[: PUBLISH_FOLDER_SLUG_MAX_LEN - len(suffix)].rstrip("-") or "p"
    return f"{root}{suffix}"


async def next_unique_publish_folder_slug(
    db: AsyncSession,
    software_id: uuid.UUID,
    base_slug: str,
    *,
    exclude_project_id: uuid.UUID | None = None,
) -> str:
    """Reserve a unique slug under software_id (suffix -2, -3, ...)."""
    candidate = base_slug[:PUBLISH_FOLDER_SLUG_MAX_LEN].rstrip("-") or "project"
    n = 2
    while True:
        q = select(Project.id).where(
            Project.software_id == software_id,
            Project.publish_folder_slug == candidate,
        )
        if exclude_project_id is not None:
            q = q.where(Project.id != exclude_project_id)
        r = await db.execute(q)
        if r.scalar_one_or_none() is None:
            return candidate
        candidate = _slug_with_numeric_suffix(base_slug, n)
        n += 1
