"""Unit tests for WorkOrderService (mocked DB)."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.exceptions import ApiError
from app.models import Project, Section, Software, WorkOrder
from app.schemas.work_order import GenerateWorkOrdersBody, WorkOrderCreate
from app.services.work_order_service import WorkOrderService


@pytest.mark.asyncio
async def test_list_work_orders_empty() -> None:
    db = AsyncMock()
    ex = MagicMock()
    ex.scalars.return_value.unique.return_value.all.return_value = []
    db.execute = AsyncMock(return_value=ex)
    out = await WorkOrderService(db).list_work_orders(uuid.uuid4())
    assert out == []


@pytest.mark.asyncio
async def test_list_work_orders_with_assignee_filter() -> None:
    from datetime import datetime, timezone

    wid = uuid.uuid4()
    pid = uuid.uuid4()
    aid = uuid.uuid4()
    now = datetime.now(timezone.utc)
    wo = MagicMock(spec=WorkOrder)
    wo.id = wid
    wo.project_id = pid
    wo.assignee_id = aid
    wo.title = "t"
    wo.description = "d"
    wo.implementation_guide = None
    wo.acceptance_criteria = None
    wo.status = "backlog"
    wo.phase = None
    wo.phase_order = None
    wo.is_stale = False
    wo.stale_reason = None
    wo.created_by = None
    wo.created_at = now
    wo.updated_at = now

    ex = MagicMock()
    ex.scalars.return_value.unique.return_value.all.return_value = [wo]
    sec_map = MagicMock()
    sec_map.all.return_value = [(wid, uuid.uuid4())]
    user_ex = MagicMock()
    user_ex.all.return_value = [(aid, "Alice")]

    async def exec_side(*a, **k):
        q = str(a[0])
        if "work_order_sections" in q.lower() or "WorkOrderSection" in str(a[0]):
            return sec_map
        if "user" in q.lower() and "display_name" in q.lower():
            return user_ex
        return ex

    db = AsyncMock()
    db.execute = AsyncMock(side_effect=exec_side)

    out = await WorkOrderService(db).list_work_orders(
        pid,
        status="backlog",
        assignee_id=aid,
    )
    assert len(out) == 1
    assert out[0].assignee_display_name == "Alice"


@pytest.mark.asyncio
async def test_get_work_order_not_found() -> None:
    db = AsyncMock()
    ex = MagicMock()
    ex.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=ex)
    with pytest.raises(ApiError) as e:
        await WorkOrderService(db).get_work_order(
            uuid.uuid4(), uuid.uuid4(), detail=False
        )
    assert e.value.error_code == "NOT_FOUND"


@pytest.mark.asyncio
async def test_create_rejects_invalid_status() -> None:
    db = AsyncMock()
    body = WorkOrderCreate(
        title="t",
        description="d",
        status="not_a_status",
        section_ids=[uuid.uuid4()],
    )
    with pytest.raises(ApiError) as e:
        await WorkOrderService(db).create(
            uuid.uuid4(), body, created_by=uuid.uuid4()
        )
    assert e.value.error_code == "INVALID_STATUS"


@pytest.mark.asyncio
async def test_add_dependency_self_raises() -> None:
    db = AsyncMock()
    wid = uuid.uuid4()
    pid = uuid.uuid4()
    with pytest.raises(ApiError) as e:
        await WorkOrderService(db).add_work_order_dependency(
            pid, wid, wid
        )
    assert e.value.status_code == 400


@pytest.mark.asyncio
async def test_remove_dependency_not_found() -> None:
    db = AsyncMock()
    wo = WorkOrder(id=uuid.uuid4(), project_id=uuid.uuid4(), title="a", description="b")
    db.get = AsyncMock(return_value=wo)
    ex = MagicMock()
    ex.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=ex)
    with pytest.raises(ApiError) as e:
        await WorkOrderService(db).remove_work_order_dependency(
            wo.project_id, wo.id, uuid.uuid4()
        )
    assert e.value.error_code == "NOT_FOUND"


@pytest.mark.asyncio
async def test_generate_invalid_llm_shape(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pid = uuid.uuid4()
    pr = Project(id=pid, software_id=uuid.uuid4(), name="P", description=None)
    sw = Software(
        id=pr.software_id,
        studio_id=uuid.uuid4(),
        name="S",
        description="d",
        definition="def",
    )
    sec = Section(
        id=uuid.uuid4(),
        project_id=pid,
        title="A",
        slug="a",
        order=0,
        content="x",
    )
    db = AsyncMock()
    db.get = AsyncMock(side_effect=[pr, sw, sec])

    async def bad(self, **kwargs):
        return {}

    monkeypatch.setattr(
        "app.services.work_order_service.LLMService.chat_structured",
        bad,
    )

    with pytest.raises(ApiError) as e:
        await WorkOrderService(db).generate_work_orders(
            pid,
            GenerateWorkOrdersBody(section_ids=[sec.id]),
            user_id=uuid.uuid4(),
        )
    assert e.value.error_code == "LLM_INVALID_SHAPE"


@pytest.mark.asyncio
async def test_get_work_order_detail_includes_notes() -> None:
    from datetime import datetime, timezone

    from app.models.work_order import WorkOrderNote

    now = datetime.now(timezone.utc)
    pid, wid, uid = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    note = WorkOrderNote(
        id=uuid.uuid4(),
        work_order_id=wid,
        author_id=uid,
        source="user",
        content="n1",
        created_at=now,
    )
    wo = WorkOrder(
        id=wid,
        project_id=pid,
        title="t",
        description="d",
        status="backlog",
        created_at=now,
        updated_at=now,
        is_stale=False,
        stale_reason=None,
    )
    wo.notes = [note]

    wo_ex = MagicMock()
    wo_ex.scalar_one_or_none.return_value = wo
    sec_ex = MagicMock()
    sec_ex.all.return_value = []

    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[wo_ex, sec_ex])

    out = await WorkOrderService(db).get_work_order(pid, wid, detail=True)
    assert len(out.notes) == 1
    assert out.notes[0].content == "n1"


@pytest.mark.asyncio
async def test_update_rejects_invalid_status() -> None:
    from datetime import datetime, timezone

    from app.schemas.work_order import WorkOrderUpdate

    now = datetime.now(timezone.utc)
    wo = WorkOrder(
        id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        title="t",
        description="d",
        status="backlog",
        created_at=now,
        updated_at=now,
    )
    db = AsyncMock()
    db.get = AsyncMock(return_value=wo)
    db.flush = AsyncMock()
    db.refresh = AsyncMock()

    body = WorkOrderUpdate(status="bogus")
    with pytest.raises(ApiError) as e:
        await WorkOrderService(db).update(
            wo.project_id, wo.id, body
        )
    assert e.value.error_code == "INVALID_STATUS"


@pytest.mark.asyncio
async def test_list_filters_phase_and_stale() -> None:
    from datetime import datetime, timezone

    pid = uuid.uuid4()
    wid = uuid.uuid4()
    now = datetime.now(timezone.utc)
    wo = MagicMock(spec=WorkOrder)
    wo.id = wid
    wo.project_id = pid
    wo.assignee_id = None
    wo.title = "t"
    wo.description = "d"
    wo.implementation_guide = None
    wo.acceptance_criteria = None
    wo.status = "in_progress"
    wo.phase = "p1"
    wo.phase_order = None
    wo.is_stale = True
    wo.stale_reason = "x"
    wo.created_by = None
    wo.created_at = now
    wo.updated_at = now

    ex = MagicMock()
    ex.scalars.return_value.unique.return_value.all.return_value = [wo]
    sec_map = MagicMock()
    sec_map.all.return_value = []

    async def exec_side(*a, **k):
        q = str(a[0])
        if "work_order_sections" in q.lower():
            return sec_map
        return ex

    db = AsyncMock()
    db.execute = AsyncMock(side_effect=exec_side)

    out = await WorkOrderService(db).list_work_orders(
        pid,
        phase="p1",
        is_stale=True,
    )
    assert len(out) == 1
    assert out[0].is_stale is True


@pytest.mark.asyncio
async def test_delete_work_order_calls_delete() -> None:
    from datetime import datetime, timezone

    pid = uuid.uuid4()
    wid = uuid.uuid4()
    now = datetime.now(timezone.utc)
    wo = WorkOrder(
        id=wid,
        project_id=pid,
        title="t",
        description="d",
        status="backlog",
        created_at=now,
        updated_at=now,
    )
    db = AsyncMock()
    db.get = AsyncMock(return_value=wo)
    db.delete = AsyncMock()
    db.flush = AsyncMock()
    await WorkOrderService(db).delete(pid, wid)
    db.delete.assert_called_once_with(wo)
