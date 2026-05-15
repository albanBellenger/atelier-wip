"""Unit tests for CodeDriftService (mocked LLM + session)."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Software
from app.services.code_drift_service import CodeDriftService
from app.services.llm_service import LLMService


@pytest.mark.asyncio
async def test_run_for_software_not_indexed_returns_skipped(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session = AsyncMock(spec=AsyncSession)
    sw_id = uuid.uuid4()
    session.get.return_value = MagicMock(spec=Software, id=sw_id)

    async def _no_snapshot(_self: object, _software_id: uuid.UUID) -> None:
        return None

    monkeypatch.setattr(
        "app.services.code_drift_service.CodebaseService.get_ready_snapshot",
        _no_snapshot,
    )
    llm = MagicMock(spec=LLMService)
    svc = CodeDriftService(session, llm)
    res = await svc.run_for_software(sw_id, uuid.uuid4())
    assert res.skipped_reason == "not_indexed"
    llm.ensure_openai_llm_ready.assert_not_called()
