"""Unit tests for overlapping text chunks."""

from app.services.text_chunking import chunk_text


def test_chunk_text_empty_returns_empty() -> None:
    assert chunk_text("") == []
    assert chunk_text("   ") == []


def test_chunk_text_nonpositive_size_returns_whole() -> None:
    assert chunk_text("hello", chunk_size=0) == ["hello"]


def test_chunk_text_overlap_steps() -> None:
    s = "a" * 100
    parts = chunk_text(s, chunk_size=30, overlap=5)
    assert len(parts) >= 2
    assert all(len(p) <= 30 for p in parts)


def test_chunk_text_single_short_string() -> None:
    assert chunk_text("hi") == ["hi"]
