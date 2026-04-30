"""Unit tests for RAG chunk ordering and mandatory overflow (Slice 6)."""

from app.services.rag_service import _mandatory_parts_with_overflow, _unified_chunk_fill


def test_chunk_ranking_unified() -> None:
    """Greedy fill follows ascending distance: 0.1, 0.2, 0.5, 0.8, 0.9."""
    candidates: list[tuple[float, str, str]] = [
        (0.9, "s3", "a"),
        (0.1, "s0", "b"),
        (0.5, "s2", "c"),
        (0.2, "s1", "d"),
        (0.8, "s4", "e"),
    ]
    base = ["p0" * 5, "p1" * 5, "p2" * 5]
    bits = _unified_chunk_fill(candidates, 10_000, base)
    order = [b.split("\n", 1)[0] for b in bits]
    assert order == [
        "### s0",
        "### s1",
        "### s2",
        "### s4",
        "### s3",
    ]


def test_overflow_truncates_current_section_with_floor() -> None:
    """def 200 + outline 100 + current 600 (raw, without section headers in spec) — use real headers."""
    h_def = "## Software definition\n" + "A" * 200
    h_out = "## Project outline\n" + "B" * 100
    h_cur = "## Current section\n"
    current_body = "C" * 600
    parts, tr = _mandatory_parts_with_overflow(
        h_def, h_out, h_cur, current_body, 400
    )
    out_body = parts[2][len(h_cur) :]
    assert tr
    assert out_body == "C" * 120
    assert not out_body.startswith("C" * 121)


def test_no_truncation_when_within_budget() -> None:
    p, tr = _mandatory_parts_with_overflow("a", "b", "c", "d", 1000)
    assert tr is False
    assert p == ["a", "b", "cd"]
