"""LLM regression: doc sync agent."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.doc_sync_agent import DocSyncAgent
from app.schemas.token_usage_scope import TokenUsageScope
from app.services.llm_service import LLMService

from tests.factories import add_studio_member, create_software, create_studio, create_user

pytestmark = [pytest.mark.llm, pytest.mark.asyncio]


async def test_doc_sync_llm_returns_proposals_shape(db_session: AsyncSession) -> None:
    sfx = uuid.uuid4().hex[:10]
    user = await create_user(
        db_session,
        email=f"ds-llm-{sfx}@example.com",
        password="llm-test-password-ok-1",
    )
    studio = await create_studio(db_session, name=f"DS Studio {sfx}")
    await add_studio_member(db_session, studio.id, user.id, role="studio_admin")
    sw = await create_software(
        db_session,
        studio.id,
        name="Payments API",
        definition="HTTP service for card charges and refunds.",
    )
    await db_session.commit()
    sid = uuid.uuid4()
    ctx = TokenUsageScope(
        studio_id=studio.id,
        software_id=sw.id,
        project_id=uuid.uuid4(),
        work_order_id=uuid.uuid4(),
        user_id=user.id,
    )
    llm = LLMService(db_session)
    out = await DocSyncAgent(db_session, llm).propose_patches(
        ctx,
        sw_name=sw.name,
        def_block=sw.definition or "",
        wo_title="Add idempotency keys",
        wo_description="Clients may retry POST /charges; use Idempotency-Key header.",
        wo_acceptance_criteria="Duplicate keys return the same response body.",
        candidate_sections_blob=(
            f"--- Candidate ---\nSection id: {sid}\nTitle: API\nSlug: api\n"
            "Markdown:\n## Errors\nReturn 409 when a duplicate charge is detected.\n"
        ),
        code_chunks_blob="- src/charges.py · L1-40: def create_charge(...):",
    )
    props = out.get("proposals")
    assert isinstance(props, list)
    if props:
        p0 = props[0]
        assert isinstance(p0.get("section_id"), str) and p0["section_id"]
        assert isinstance(p0.get("rationale"), str) and p0["rationale"].strip()
        assert isinstance(p0.get("replacement_markdown"), str)
