"""Unit tests for publish folder slug helpers (no DB)."""

import pytest

from app.services.publish_folder_slug import (
    PUBLISH_FOLDER_SLUG_MAX_LEN,
    coerce_publish_folder_slug_for_create,
    coerce_publish_folder_slug_for_update,
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
