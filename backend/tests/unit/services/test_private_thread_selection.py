"""Unit: selection validation and RAG excerpt block for private thread."""

import pytest

from app.exceptions import ApiError
from app.services.private_thread_selection import (
    SELECTED_EXCERPT_RAG_MAX,
    excerpt_block_for_rag,
    validate_selection_against_snapshot,
)


def test_validate_returns_none_when_no_bounds() -> None:
    assert (
        validate_selection_against_snapshot(
            snapshot="abc",
            selection_from=None,
            selection_to=None,
            selected_plaintext=None,
        )
        is None
    )


def test_validate_raises_when_only_from() -> None:
    with pytest.raises(ApiError) as ei:
        validate_selection_against_snapshot(
            snapshot="abc",
            selection_from=0,
            selection_to=None,
            selected_plaintext=None,
        )
    assert ei.value.status_code == 422


def test_validate_matches_plaintext() -> None:
    r = validate_selection_against_snapshot(
        snapshot="hello world",
        selection_from=0,
        selection_to=5,
        selected_plaintext="hello",
    )
    assert r == (0, 5, "hello")


def test_validate_plaintext_mismatch() -> None:
    with pytest.raises(ApiError) as ei:
        validate_selection_against_snapshot(
            snapshot="hello world",
            selection_from=0,
            selection_to=5,
            selected_plaintext="hallo",
        )
    assert ei.value.status_code == 422


def test_validate_empty_excerpt() -> None:
    with pytest.raises(ApiError):
        validate_selection_against_snapshot(
            snapshot="   x",
            selection_from=0,
            selection_to=3,
            selected_plaintext="   ",
        )


def test_excerpt_block_truncates() -> None:
    huge = "x" * (SELECTED_EXCERPT_RAG_MAX + 50)
    block = excerpt_block_for_rag(huge)
    assert "## User-selected excerpt" in block
    assert "…" in block
    assert len(block) < len(huge) + 200
