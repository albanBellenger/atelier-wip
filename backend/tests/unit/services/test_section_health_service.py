"""Section health batching: must not run concurrent DB work on one AsyncSession."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.schemas.context_preview import ContextPreviewOut
from app.services.rag_service import RAGService
from app.services.section_health_service import SectionHealthService


@pytest.mark.asyncio
async def test_batch_outline_health_lite_calls_rag_sequentially(monkeypatch: pytest.MonkeyPatch) -> None:
    """Regression: asyncio.gather + one session caused InvalidRequestError / asyncpg InterfaceError."""
    call_order: list[uuid.UUID] = []

    async def fake_build(
        self: RAGService,
        q: str,
        project_id: uuid.UUID,
        section_id: uuid.UUID,
        **kwargs: object,
    ) -> ContextPreviewOut:
        _ = (self, q, project_id, kwargs)
        call_order.append(section_id)
        return ContextPreviewOut(
            blocks=[],
            total_tokens=1,
            budget_tokens=6000,
            overflow_strategy_applied=None,
            debug_raw_rag_text=None,
        )

    monkeypatch.setattr(RAGService, "build_context_with_blocks", fake_build)

    def empty_result() -> MagicMock:
        r = MagicMock()
        r.all.return_value = []
        return r

    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[empty_result(), empty_result()])

    pid = uuid.uuid4()
    s1, s2 = uuid.uuid4(), uuid.uuid4()
    sec1 = MagicMock()
    sec1.id = s1
    sec2 = MagicMock()
    sec2.id = s2

    out = await SectionHealthService(db).batch_outline_health_lite(
        project_id=pid,
        sections=[sec1, sec2],
        token_budget=6000,
    )
    assert call_order == [s1, s2]
    assert out[s1].token_used == 1
    assert out[s2].token_used == 1
