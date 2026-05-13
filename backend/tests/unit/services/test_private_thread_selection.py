"""Unit: selection validation and RAG excerpt block for private thread."""

import pytest

from app.exceptions import ApiError
from app.services.private_thread_selection import (
    SELECTED_EXCERPT_RAG_MAX,
    excerpt_block_for_rag,
    validate_selection_against_snapshot,
)


def test_validate_returns_none_when_no_selection() -> None:
    assert (
        validate_selection_against_snapshot(
            snapshot="abc",
            selected_plaintext=None,
            require_unique_in_snapshot=False,
        )
        is None
    )


def test_validate_returns_none_when_whitespace_only() -> None:
    assert (
        validate_selection_against_snapshot(
            snapshot="abc",
            selected_plaintext="   ",
            require_unique_in_snapshot=False,
        )
        is None
    )


def test_validate_substring_ok() -> None:
    r = validate_selection_against_snapshot(
        snapshot="hello world",
        selected_plaintext="hello",
        require_unique_in_snapshot=False,
    )
    assert r == "hello"


def test_validate_unique_required() -> None:
    with pytest.raises(ApiError) as ei:
        validate_selection_against_snapshot(
            snapshot="aaa",
            selected_plaintext="a",
            require_unique_in_snapshot=True,
        )
    assert ei.value.status_code == 422


def test_validate_unique_ok() -> None:
    r = validate_selection_against_snapshot(
        snapshot="aba",
        selected_plaintext="b",
        require_unique_in_snapshot=True,
    )
    assert r == "b"


def test_validate_plaintext_not_in_snapshot() -> None:
    with pytest.raises(ApiError) as ei:
        validate_selection_against_snapshot(
            snapshot="hello world",
            selected_plaintext="nope",
            require_unique_in_snapshot=False,
        )
    assert ei.value.status_code == 422


def test_validate_requires_snapshot() -> None:
    with pytest.raises(ApiError):
        validate_selection_against_snapshot(
            snapshot=None,
            selected_plaintext="x",
            require_unique_in_snapshot=False,
        )


def test_excerpt_block_truncates() -> None:
    huge = "x" * (SELECTED_EXCERPT_RAG_MAX + 50)
    block = excerpt_block_for_rag(huge)
    assert "## User-selected excerpt" in block
    assert "…" in block
    assert len(block) < len(huge) + 200
