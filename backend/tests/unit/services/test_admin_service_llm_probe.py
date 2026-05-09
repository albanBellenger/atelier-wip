"""AdminService.test_llm registry behavior."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import LlmProviderRegistry
from app.schemas.auth import AdminLlmProbeBody
from app.services.admin_service import AdminService


@pytest.mark.asyncio
async def test_test_llm_returns_structured_failure_when_registry_empty(
    db_session: AsyncSession,
) -> None:
    await db_session.execute(delete(LlmProviderRegistry))
    await db_session.flush()
    out = await AdminService(db_session).test_llm(AdminLlmProbeBody())
    assert out.ok is False
    assert "No LLM providers" in out.message
    assert out.detail


@pytest.mark.asyncio
async def test_test_llm_returns_failure_when_no_default_row(
    db_session: AsyncSession,
) -> None:
    await db_session.execute(delete(LlmProviderRegistry))
    await db_session.flush()
    db_session.add(
        LlmProviderRegistry(
            id=uuid.uuid4(),
            provider_id="solo",
            models_json='["gpt-4o-mini"]',
            api_base_url=None,
            logo_url=None,
            status="connected",
            is_default=False,
            sort_order=0,
            api_key=None,
            litellm_provider_slug=None,
        )
    )
    await db_session.flush()
    out = await AdminService(db_session).test_llm(AdminLlmProbeBody())
    assert out.ok is False
    assert "default" in (out.message or "").lower() or "default" in (out.detail or "").lower()
