"""Unit tests for RAG chunk ordering and mandatory overflow (Slice 6)."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.rag_service import RAGService, _mandatory_parts_with_overflow, _unified_chunk_fill
from tests.factories import create_project, create_section, create_software, create_studio


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


@pytest.mark.asyncio
async def test_rag_build_context_matches_joined_preview_blocks(
    db_session: AsyncSession,
) -> None:
    """Structured preview uses the same assembly path as build_context."""
    studio = await create_studio(db_session)
    sw = await create_software(db_session, studio.id, definition="def-small")
    pr = await create_project(db_session, sw.id)
    await create_section(
        db_session, pr.id, title="T", slug="t", order=0, content="Hello body"
    )
    sec2 = await create_section(
        db_session, pr.id, title="U", slug="u", order=1, content="Second"
    )
    rag = RAGService(db_session)
    ctx = await rag.build_context(
        query="hello",
        project_id=pr.id,
        current_section_id=sec2.id,
        token_budget=6000,
    )
    prev = await rag.build_context_with_blocks(
        "hello",
        pr.id,
        sec2.id,
        token_budget=6000,
    )
    joined = "\n\n".join(b.body for b in prev.blocks)
    assert ctx.text == joined
    assert prev.budget_tokens == 6000
    assert prev.blocks[0].kind == "software_def"
    assert prev.blocks[1].kind == "outline"
    assert any(b.kind == "current_section" for b in prev.blocks)


@pytest.mark.asyncio
async def test_rag_build_context_prefers_plaintext_override(
    db_session: AsyncSession,
) -> None:
    studio = await create_studio(db_session)
    sw = await create_software(db_session, studio.id, definition="def-small")
    pr = await create_project(db_session, sw.id)
    sec = await create_section(
        db_session, pr.id, title="T", slug="t", order=0, content="DB_ONLY"
    )
    rag = RAGService(db_session)
    ctx = await rag.build_context(
        query="",
        project_id=pr.id,
        current_section_id=sec.id,
        token_budget=6000,
        current_section_plaintext_override="OVERRIDE_BODY",
    )
    assert "OVERRIDE_BODY" in ctx.text
    assert "DB_ONLY" not in ctx.text
