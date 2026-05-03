"""Unit tests for publish folder slug helpers (no DB)."""

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.publish_folder_slug import (
    PUBLISH_FOLDER_SLUG_MAX_LEN,
    coerce_publish_folder_slug_for_create,
    coerce_publish_folder_slug_for_update,
    next_unique_publish_folder_slug,
    normalize_publish_folder_slug,
    slug_from_project_name,
)


def test_slug_from_project_name_whitespace_falls_back_to_project() -> None:
    assert slug_from_project_name("   ") == "project"


def test_slug_from_project_name_truncates_when_slug_exceeds_max() -> None:
    long_name = "x" * (PUBLISH_FOLDER_SLUG_MAX_LEN + 40)
    out = slug_from_project_name(long_name)
    assert len(out) == PUBLISH_FOLDER_SLUG_MAX_LEN
    assert out == "x" * PUBLISH_FOLDER_SLUG_MAX_LEN


def test_coerce_publish_folder_slug_for_create_empty_uses_fallback_name() -> None:
    assert coerce_publish_folder_slug_for_create(None, fallback_name="My App") == "my-app"
    assert coerce_publish_folder_slug_for_create("", fallback_name="My App") == "my-app"
    assert coerce_publish_folder_slug_for_create("  \t", fallback_name="My App") == "my-app"


def test_coerce_publish_folder_slug_for_create_valid_normalizes() -> None:
    assert coerce_publish_folder_slug_for_create("  Alpha-Beta ", fallback_name="X") == "alpha-beta"


def test_coerce_publish_folder_slug_for_create_invalid_falls_back_to_slugified_raw() -> None:
    assert coerce_publish_folder_slug_for_create("bad slug!", fallback_name="ignored") == "bad-slug"


def test_normalize_publish_folder_slug_rejects_empty() -> None:
    with pytest.raises(ValueError, match="empty"):
        normalize_publish_folder_slug("")
    with pytest.raises(ValueError, match="empty"):
        normalize_publish_folder_slug("   ")


def test_normalize_publish_folder_slug_rejects_invalid_charset() -> None:
    with pytest.raises(ValueError, match="invalid_charset"):
        normalize_publish_folder_slug("no spaces")


def test_normalize_publish_folder_slug_truncates_long_valid_slug() -> None:
    raw = "a" * (PUBLISH_FOLDER_SLUG_MAX_LEN + 10)
    out = normalize_publish_folder_slug(raw)
    assert len(out) == PUBLISH_FOLDER_SLUG_MAX_LEN
    assert out == "a" * PUBLISH_FOLDER_SLUG_MAX_LEN


def test_normalize_publish_folder_slug_truncation_all_hyphens_raises_empty() -> None:
    raw = "-" * (PUBLISH_FOLDER_SLUG_MAX_LEN + 5)
    with pytest.raises(ValueError, match="empty"):
        normalize_publish_folder_slug(raw)


def test_coerce_publish_folder_slug_for_update_invalid_falls_back() -> None:
    assert coerce_publish_folder_slug_for_update("!!!") == "section"


@pytest.mark.asyncio
async def test_next_unique_publish_folder_slug_returns_base_when_unused() -> None:
    db = AsyncMock()
    res = MagicMock()
    res.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=res)
    sid = uuid.uuid4()
    out = await next_unique_publish_folder_slug(db, sid, "my-export")
    assert out == "my-export"
    db.execute.assert_awaited_once()


@pytest.mark.asyncio
async def test_next_unique_publish_folder_slug_suffixes_on_collision() -> None:
    db = AsyncMock()
    taken = MagicMock()
    taken.scalar_one_or_none.return_value = uuid.uuid4()
    free = MagicMock()
    free.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(side_effect=[taken, free])
    sid = uuid.uuid4()
    out = await next_unique_publish_folder_slug(db, sid, "dup")
    assert out == "dup-2"
    assert db.execute.await_count == 2


@pytest.mark.asyncio
async def test_next_unique_publish_folder_slug_respects_exclude_project() -> None:
    db = AsyncMock()
    res = MagicMock()
    res.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=res)
    sid = uuid.uuid4()
    exclude = uuid.uuid4()
    out = await next_unique_publish_folder_slug(
        db, sid, "reserved", exclude_project_id=exclude
    )
    assert out == "reserved"
    db.execute.assert_awaited_once()
