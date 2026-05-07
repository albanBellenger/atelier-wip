"""Unit tests for backlog dedupe analysis and merge (mocked DB / LLM)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.exceptions import ApiError
from app.models import WorkOrder
from app.schemas.work_order import (
    WorkOrderDedupeApplyBody,
    WorkOrderDedupeApplyMergedFields,
)
from app.services.work_order_service import WorkOrderService


@pytest.mark.asyncio
async def test_analyze_backlog_duplicates_short_circuits_empty_backlog(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """No LLM call when there are zero or one backlog work orders."""
    called: list[object] = []

    async def no_llm(self, **kwargs: object) -> None:
        called.append(True)

    monkeypatch.setattr(
        "app.services.work_order_service.LLMService.chat_structured",
        no_llm,
    )

    pid = uuid.uuid4()
    pr = MagicMock()
    pr.software_id = uuid.uuid4()
    sw = MagicMock()
    sw.id = pr.software_id
    sw.studio_id = uuid.uuid4()
    sw.name = "SW"
    sw.definition = "def"

    wo_empty = MagicMock()
    wo_empty.scalars.return_value.unique.return_value.all.return_value = []

    db = AsyncMock()
    db.get = AsyncMock(side_effect=[pr, sw])
    db.execute = AsyncMock(return_value=wo_empty)

    out = await WorkOrderService(db).analyze_backlog_duplicates(
        pid,
        user_id=uuid.uuid4(),
    )
    assert out.groups == []
    assert called == []


@pytest.mark.asyncio
async def test_apply_backlog_dedupe_merge_rejects_keep_in_archive_list() -> None:
    kid = uuid.uuid4()
    aid = uuid.uuid4()
    body = WorkOrderDedupeApplyBody(
        keep_work_order_id=kid,
        archive_work_order_ids=[kid, aid],
        merged_fields=WorkOrderDedupeApplyMergedFields(
            title="T",
            description="D",
        ),
    )
    db = AsyncMock()
    with pytest.raises(ApiError) as ei:
        await WorkOrderService(db).apply_backlog_dedupe_merge(
            uuid.uuid4(),
            body,
            actor_id=uuid.uuid4(),
        )
    assert ei.value.error_code == "INVALID_MERGE"


@pytest.mark.asyncio
async def test_apply_requires_backlog_status() -> None:
    pid = uuid.uuid4()
    kid = uuid.uuid4()
    aid = uuid.uuid4()
    now = datetime.now(timezone.utc)
    keep = WorkOrder(
        id=kid,
        project_id=pid,
        title="K",
        description="d",
        status="in_progress",
        created_at=now,
        updated_at=now,
        is_stale=False,
    )
    db = AsyncMock()
    db.get = AsyncMock(side_effect=[keep])

    body = WorkOrderDedupeApplyBody(
        keep_work_order_id=kid,
        archive_work_order_ids=[aid],
        merged_fields=WorkOrderDedupeApplyMergedFields(title="T", description="D"),
    )
    with pytest.raises(ApiError) as ei:
        await WorkOrderService(db).apply_backlog_dedupe_merge(
            pid,
            body,
            actor_id=uuid.uuid4(),
        )
    assert ei.value.error_code == "INVALID_MERGE"
