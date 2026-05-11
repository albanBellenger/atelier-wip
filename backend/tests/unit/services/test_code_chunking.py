"""Unit tests for codebase chunking helpers."""

from app.services.code_chunking import (
    chunk_source,
    sanitize_codebase_embed_text,
    should_skip_path,
)


def test_should_skip_node_modules() -> None:
    assert should_skip_path("foo/node_modules/pkg/a.js") is True
    assert should_skip_path("src/main.py") is False


def test_fallback_chunk_for_plain_ext() -> None:
    pieces = chunk_source("LICENSE", "line1\n\nline2\n" * 50, max_chars=80)
    assert pieces
    assert all(p.text for p in pieces)


def test_python_chunks_nonempty() -> None:
    src = "def foo():\n    return 1\n\nclass Bar:\n    pass\n"
    pieces = chunk_source("pkg/mod.py", src, max_chars=500)
    assert pieces
    joined = "\n".join(p.text for p in pieces)
    assert "foo" in joined


def test_oversized_single_line_is_split() -> None:
    """Markdown line chunking must not emit one piece longer than max_chars."""
    long_line = "x" * 8000
    pieces = chunk_source("docs/huge.md", f"intro\n{long_line}\noutro", max_chars=500)
    assert pieces
    assert all(len(p.text) <= 500 for p in pieces)


def test_base64_data_url_sanitized_before_chunking() -> None:
    raw = "text\n![](data:image/png;base64,QUJDDE==)more"
    cleaned = sanitize_codebase_embed_text(raw)
    assert "QUJDDE" not in cleaned
    assert "[binary data omitted]" in cleaned
    pieces = chunk_source("doc.md", raw, max_chars=2000)
    joined = "\n".join(p.text for p in pieces)
    assert "QUJDDE" not in joined
