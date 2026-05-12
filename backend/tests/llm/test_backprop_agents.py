"""LLM regression: backprop outline + section agents."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.backprop_outline_agent import BackpropOutlineAgent
from app.agents.backprop_section_agent import BackpropSectionAgent
from app.schemas.token_usage_scope import TokenUsageScope
from app.services.llm_service import LLMService

from tests.factories import add_studio_member, create_software, create_studio, create_user

pytestmark = [pytest.mark.llm, pytest.mark.asyncio]


async def test_backprop_outline_llm_returns_sections_shape(
    db_session: AsyncSession,
) -> None:
    sfx = uuid.uuid4().hex[:10]
    user = await create_user(
        db_session,
        email=f"bp-out-{sfx}@example.com",
        password="llm-test-password-ok-1",
    )
    studio = await create_studio(db_session, name=f"BP Studio {sfx}")
    await add_studio_member(db_session, studio.id, user.id, role="studio_admin")
    sw = await create_software(
        db_session,
        studio.id,
        name="Billing Service",
        definition="REST API for invoices and payment webhooks.",
    )
    await db_session.commit()
    ctx = TokenUsageScope(
        studio_id=studio.id,
        software_id=sw.id,
        project_id=None,
        user_id=user.id,
    )
    llm = LLMService(db_session)
    out = await BackpropOutlineAgent(db_session, llm).propose_outline(
        ctx,
        sw_name=sw.name,
        def_block=sw.definition or "",
        repo_map_blob="src/api/routes.py\nsrc/models/invoice.py\n",
        hint="Emphasise public HTTP API.",
    )
    assert isinstance(out.get("sections"), list)
    sections = out["sections"]
    assert sections
    first = sections[0]
    assert isinstance(first.get("title"), str) and first["title"].strip()
    assert isinstance(first.get("slug"), str) and first["slug"].strip()
    assert isinstance(first.get("summary"), str)


async def test_backprop_section_llm_returns_markdown_shape(
    db_session: AsyncSession,
) -> None:
    sfx = uuid.uuid4().hex[:10]
    user = await create_user(
        db_session,
        email=f"bp-sec-{sfx}@example.com",
        password="llm-test-password-ok-1",
    )
    studio = await create_studio(db_session, name=f"BP2 Studio {sfx}")
    await add_studio_member(db_session, studio.id, user.id, role="studio_admin")
    sw = await create_software(
        db_session,
        studio.id,
        name="Task Runner",
        definition="CLI and library for background jobs.",
    )
    await db_session.commit()
    ctx = TokenUsageScope(
        studio_id=studio.id,
        software_id=sw.id,
        project_id=None,
        user_id=user.id,
    )
    llm = LLMService(db_session)
    out = await BackpropSectionAgent(db_session, llm).propose_section(
        ctx,
        sw_name=sw.name,
        def_block=sw.definition or "",
        section_title="Architecture overview",
        section_summary="High-level modules and entry points.",
        repo_map_blob="cmd/runner/main.go\ninternal/worker/pool.go\n",
        code_chunks_blob="=== cmd/runner/main.go (lines 1-20)\npackage main\nfunc main() {}\n",
    )
    assert isinstance(out.get("markdown"), str)
    assert isinstance(out.get("source_files"), list)
    md = out["markdown"]
    assert "architecture" in md.lower() or "runner" in md.lower() or "main" in md.lower()
    for p in out["source_files"]:
        assert isinstance(p, str) and p.strip()
