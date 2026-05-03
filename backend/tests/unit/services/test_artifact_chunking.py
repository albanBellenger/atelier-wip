"""Artifact chunking dispatcher (no network)."""

from __future__ import annotations

import pytest

from app.exceptions import ApiError
from app.services.artifact_chunking import (
    ARTIFACT_CHUNKING_STRATEGIES,
    chunk_artifact_text,
    validate_chunking_strategy,
)


def test_validate_fixed_window_maps_to_none() -> None:
    assert validate_chunking_strategy("fixed_window") is None
    assert validate_chunking_strategy(None) is None
    assert validate_chunking_strategy("  ") is None


def test_validate_sentence_normalized() -> None:
    assert validate_chunking_strategy("Sentence") == "sentence"


def test_validate_unknown_raises() -> None:
    with pytest.raises(ApiError) as ei:
        validate_chunking_strategy("nope")
    assert ei.value.status_code == 422


def test_strategies_tuple_contains_fixed_window() -> None:
    assert "fixed_window" in ARTIFACT_CHUNKING_STRATEGIES


def test_chunk_artifact_text_fixed_window_matches_legacy_windowing() -> None:
    from app.services.text_chunking import chunk_text

    text = "a" * 100 + "b" * 100
    assert chunk_artifact_text(text, None) == chunk_text(text)
    assert chunk_artifact_text(text, "fixed_window") == chunk_text(text)


def test_chunk_artifact_text_sentence_returns_list() -> None:
    text = "First sentence here. Second sentence follows. Third one too."
    parts = chunk_artifact_text(text, "sentence")
    assert isinstance(parts, list)
    assert len(parts) >= 1


def test_chunk_artifact_text_markdown_returns_list() -> None:
    text = "# H\n\nBody.\n\n## Sub\n\nMore."
    parts = chunk_artifact_text(text, "markdown")
    assert isinstance(parts, list)
    assert len(parts) >= 1
