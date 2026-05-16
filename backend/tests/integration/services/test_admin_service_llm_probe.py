"""AdminService.test_llm registry behavior."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.auth import AdminLlmProbeBody
from app.services.admin_service import AdminService


@pytest.mark.asyncio
async def test_test_llm_returns_structured_failure_when_registry_empty() -> None:
    session = AsyncMock(spec=AsyncSession)
    session.scalar.return_value = 0
    out = await AdminService(session).test_llm(AdminLlmProbeBody())
    assert out.ok is False
    assert "No LLM providers" in out.message
    assert out.detail


@pytest.mark.asyncio
async def test_test_llm_returns_failure_when_no_default_row() -> None:
    session = AsyncMock(spec=AsyncSession)
    session.scalar.return_value = 1
    exec_result = MagicMock()
    exec_result.scalar_one_or_none.return_value = None
    session.execute = AsyncMock(return_value=exec_result)
    out = await AdminService(session).test_llm(AdminLlmProbeBody())
    assert out.ok is False
    assert "default" in (out.message or "").lower() or "default" in (out.detail or "").lower()
