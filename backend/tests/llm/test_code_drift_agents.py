"""LLM regression: code drift section + work order agents (Slice 16e)."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.code_drift_section_agent import CodeDriftSectionAgent
from app.agents.code_drift_work_order_agent import CodeDriftWorkOrderAgent
from app.schemas.token_usage_scope import TokenUsageScope
from app.services.llm_service import LLMService

from tests.factories import add_studio_member, create_software, create_studio, create_user

pytestmark = [pytest.mark.llm, pytest.mark.asyncio]


async def test_code_drift_section_llm_returns_shape(db_session: AsyncSession) -> None:
    sfx = uuid.uuid4().hex[:10]
    user = await create_user(
        db_session,
        email=f"cd-sec-{sfx}@example.com",
        password="llm-test-password-ok-1",
    )
    studio = await create_studio(db_session, name=f"CD Sec {sfx}")
    await add_studio_member(db_session, studio.id, user.id, role="studio_admin")
    sw = await create_software(
        db_session,
        studio.id,
        name="Auth Service",
        definition="Issues JWT access tokens for API clients.",
    )
    await db_session.commit()
    ctx = TokenUsageScope(
        studio_id=studio.id,
        software_id=sw.id,
        project_id=None,
        user_id=user.id,
    )
    llm = LLMService(db_session)
    out = await CodeDriftSectionAgent(db_session, llm).analyse(
        ctx,
        sw_name=sw.name,
        def_block=sw.definition or "",
        section_title="Token lifetime",
        section_body="Access tokens never expire.",
        repo_map_blob="src/auth/tokens.py\nsrc/api/middleware.py\n",
        code_chunks_blob="=== src/auth/tokens.py (lines 1-40)\ndef refresh_token_ttl():\n    return 3600\n",
    )
    assert isinstance(out.get("likely_drifted"), bool)
    assert isinstance(out.get("severity"), str) and out["severity"] in ("low", "medium", "high")
    assert isinstance(out.get("reason"), str) and out["reason"].strip()
    assert isinstance(out.get("code_refs"), list)


async def test_code_drift_work_order_llm_returns_shape(db_session: AsyncSession) -> None:
    sfx = uuid.uuid4().hex[:10]
    user = await create_user(
        db_session,
        email=f"cd-wo-{sfx}@example.com",
        password="llm-test-password-ok-1",
    )
    studio = await create_studio(db_session, name=f"CD WO {sfx}")
    await add_studio_member(db_session, studio.id, user.id, role="studio_admin")
    sw = await create_software(
        db_session,
        studio.id,
        name="Worker",
        definition="Background job processor with Redis queue.",
    )
    await db_session.commit()
    ctx = TokenUsageScope(
        studio_id=studio.id,
        software_id=sw.id,
        project_id=None,
        user_id=user.id,
    )
    llm = LLMService(db_session)
    out = await CodeDriftWorkOrderAgent(db_session, llm).analyse(
        ctx,
        sw_name=sw.name,
        def_block=sw.definition or "",
        wo_title="Add retry backoff",
        wo_description="Failed jobs should retry with exponential delay.",
        wo_acceptance_criteria="Backoff visible in worker dequeue path.",
        repo_map_blob="worker/dequeue.go\nworker/retry.go\n",
        code_chunks_blob="=== worker/dequeue.go (lines 1-30)\npackage worker\nfunc Dequeue() {}\n",
    )
    assert out.get("verdict") in ("complete", "partial", "missing")
    assert isinstance(out.get("reason"), str) and out["reason"].strip()
    assert isinstance(out.get("code_refs"), list)
