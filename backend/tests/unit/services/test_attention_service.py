"""Unit tests for attention helpers."""

from app.services.attention_service import _slug_file


def test_slug_file_appends_md() -> None:
    assert _slug_file("auth") == "auth.md"


def test_slug_file_empty_slug() -> None:
    assert _slug_file("") == "section.md"
    assert _slug_file("   ") == "section.md"
