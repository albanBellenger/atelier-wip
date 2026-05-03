"""Additional unit tests for WorkOrderService — target 100% line coverage."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.exceptions import ApiError
from app.models import Project, Section, Software, WorkOrder
from app.models.work_order import WorkOrderNote
from app.schemas.work_order import (
    GenerateWorkOrdersBody,
    WorkOrderCreate,
    WorkOrderNoteCreate,
    WorkOrderUpdate,
)
from app.services.work_order_service import WorkOrderService


def _wo_mock(
    *,
    wid: uuid.UUID | None = None,
    pid: uuid.UUID | None = None,
    assignee: uuid.UUID | None = None,
) -> MagicMock:
    now = datetime.now(timezone.utc)
    wid = wid or uuid.uuid4()
    pid = pid or uuid.uuid4()
    wo = MagicMock(spec=WorkOrder)
    wo.id = wid
    wo.project_id = pid
    wo.assignee_id = assignee
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
    wo.updated_by_id = None
    wo.updated_at = now
    return wo


@pytest.mark.asyncio
async def test_section_ids_for_work_orders_empty_input() -> None:
    db = MagicMock()
    db.execute = AsyncMock()
    out = await WorkOrderService(db)._section_ids_for_work_orders([])
    assert out == {}
    db.execute.assert_not_called()


@pytest.mark.asyncio
async def test_user_display_names_empty_ids() -> None:
    db = MagicMock()
    db.execute = AsyncMock()
    out = await WorkOrderService(db)._user_display_names(set())
    assert out == {}
    db.execute.assert_not_called()


@pytest.mark.asyncio
async def test_list_work_orders_section_id_filter() -> None:
    pid = uuid.uuid4()
    sec_id = uuid.uuid4()
    wo = _wo_mock(pid=pid)

    list_ex = MagicMock()
    list_ex.scalars.return_value.unique.return_value.all.return_value = [wo]
    sec_ex = MagicMock()
    sec_ex.all.return_value = []

    n = 0

    async def exec_side(*a: object, **k: object) -> MagicMock:
        nonlocal n
        n += 1
        return list_ex if n == 1 else sec_ex

    db = MagicMock()
    db.execute = AsyncMock(side_effect=exec_side)

    out = await WorkOrderService(db).list_work_orders(pid, section_id=sec_id)
    assert len(out) == 1


@pytest.mark.asyncio
async def test_get_work_order_detail_false_returns_base() -> None:
    pid, wid = uuid.uuid4(), uuid.uuid4()
    now = datetime.now(timezone.utc)
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
    wo_ex = MagicMock()
    wo_ex.scalar_one_or_none.return_value = wo
    sec_ex = MagicMock()
    sec_ex.all.return_value = []

    db = MagicMock()
    db.execute = AsyncMock(side_effect=[wo_ex, sec_ex])

    out = await WorkOrderService(db).get_work_order(pid, wid, detail=False)
    assert out.id == wid
    assert not hasattr(out, "notes") or getattr(out, "notes", None) is None


@pytest.mark.asyncio
async def test_get_wo_wrong_project_raises() -> None:
    pid, wid = uuid.uuid4(), uuid.uuid4()
    wo = WorkOrder(
        id=wid,
        project_id=uuid.uuid4(),
        title="t",
        description="d",
        status="backlog",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db = MagicMock()
    db.get = AsyncMock(return_value=wo)
    with pytest.raises(ApiError) as e:
        await WorkOrderService(db)._get_wo(pid, wid)
    assert e.value.error_code == "NOT_FOUND"


@pytest.mark.asyncio
async def test_create_success_and_set_sections() -> None:
    pid = uuid.uuid4()
    sid = uuid.uuid4()
    uid = uuid.uuid4()
    sec = Section(
        id=sid,
        project_id=pid,
        title="S",
        slug="s",
        order=1,
        content="",
    )
    wo_holder: dict[str, uuid.UUID] = {}

    def capture_add(obj: object) -> None:
        if isinstance(obj, WorkOrder):
            wo_holder["id"] = obj.id

    del_ex = MagicMock()
    sec_map_ex = MagicMock()

    async def exec_side(*a: object, **k: object) -> MagicMock:
        sec_map_ex.all.return_value = [(wo_holder["id"], sid)]
        return del_ex if "delete" in str(a[0]).lower() else sec_map_ex

    db = MagicMock()
    db.add = MagicMock(side_effect=capture_add)
    db.flush = AsyncMock()
    now_ts = datetime.now(timezone.utc)

    async def refresh_wo(w: object) -> None:
        if isinstance(w, WorkOrder):
            w.created_at = now_ts
            w.updated_at = now_ts
            w.is_stale = False

    db.refresh = AsyncMock(side_effect=refresh_wo)
    db.execute = AsyncMock(side_effect=exec_side)
    db.get = AsyncMock(return_value=sec)

    body = WorkOrderCreate(
        title="  T  ",
        description="  D  ",
        status="backlog",
        implementation_guide="  ig  ",
        acceptance_criteria="  ac  ",
        phase="  ph  ",
        phase_order=3,
        assignee_id=None,
        section_ids=[sid],
    )
    out = await WorkOrderService(db).create(pid, body, created_by=uid)
    assert out.title == "T"
    assert out.description == "D"
    assert out.phase == "ph"
    assert db.add.call_count >= 2


@pytest.mark.asyncio
async def test_create_optional_text_fields_none() -> None:
    pid = uuid.uuid4()
    sid = uuid.uuid4()
    sec = Section(
        id=sid,
        project_id=pid,
        title="S",
        slug="s",
        order=1,
        content="",
    )
    wo_holder: dict[str, uuid.UUID] = {}

    def capture_add(obj: object) -> None:
        if isinstance(obj, WorkOrder):
            wo_holder["id"] = obj.id

    del_ex = MagicMock()
    sec_map_ex = MagicMock()

    async def exec_side(*a: object, **k: object) -> MagicMock:
        sec_map_ex.all.return_value = [(wo_holder["id"], sid)]
        return del_ex if "delete" in str(a[0]).lower() else sec_map_ex

    db = MagicMock()
    db.add = MagicMock(side_effect=capture_add)
    db.flush = AsyncMock()
    now = datetime.now(timezone.utc)

    async def refresh_wo2(w: object) -> None:
        if isinstance(w, WorkOrder):
            w.created_at = now
            w.updated_at = now
            w.is_stale = False

    db.refresh = AsyncMock(side_effect=refresh_wo2)
    db.execute = AsyncMock(side_effect=exec_side)
    db.get = AsyncMock(return_value=sec)

    body = WorkOrderCreate(
        title="t",
        description="d",
        status="done",
        implementation_guide=None,
        acceptance_criteria=None,
        phase=None,
        section_ids=[sid],
    )
    await WorkOrderService(db).create(pid, body, created_by=uuid.uuid4())


@pytest.mark.asyncio
async def test_set_sections_rejects_wrong_project_section() -> None:
    pid = uuid.uuid4()
    wid = uuid.uuid4()
    sid = uuid.uuid4()
    sec = Section(
        id=sid,
        project_id=uuid.uuid4(),
        title="S",
        slug="s",
        order=1,
        content="",
    )
    db = MagicMock()
    db.execute = AsyncMock(return_value=MagicMock())
    db.get = AsyncMock(return_value=sec)
    with pytest.raises(ApiError) as e:
        await WorkOrderService(db)._set_sections(wid, pid, [sid])
    assert e.value.error_code == "INVALID_SECTION"


@pytest.mark.asyncio
async def test_set_sections_rejects_missing_section() -> None:
    pid = uuid.uuid4()
    wid = uuid.uuid4()
    sid = uuid.uuid4()
    db = MagicMock()
    db.execute = AsyncMock(return_value=MagicMock())
    db.get = AsyncMock(return_value=None)
    with pytest.raises(ApiError) as e:
        await WorkOrderService(db)._set_sections(wid, pid, [sid])
    assert e.value.error_code == "INVALID_SECTION"


@pytest.mark.asyncio
async def test_update_all_scalar_fields() -> None:
    pid = uuid.uuid4()
    wid = uuid.uuid4()
    now = datetime.now(timezone.utc)
    wo = WorkOrder(
        id=wid,
        project_id=pid,
        title="old",
        description="oldd",
        status="backlog",
        created_at=now,
        updated_at=now,
        is_stale=False,
        stale_reason=None,
    )
    wo.implementation_guide = "x"
    wo.acceptance_criteria = "y"
    wo.phase = "p0"
    wo.phase_order = 1
    wo.assignee_id = None

    sec_map_ex = MagicMock()
    sec_map_ex.all.return_value = []

    db = MagicMock()
    db.get = AsyncMock(return_value=wo)
    db.flush = AsyncMock()
    db.refresh = AsyncMock()
    db.execute = AsyncMock(return_value=sec_map_ex)

    aid = uuid.uuid4()
    sid = uuid.uuid4()
    sec = Section(id=sid, project_id=pid, title="S", slug="s", order=0, content="")
    del_ex = MagicMock()

    async def exec_update(*a: object, **k: object) -> MagicMock:
        if "delete" in str(a[0]).lower():
            return del_ex
        return sec_map_ex

    db.execute = AsyncMock(side_effect=exec_update)
    pr = Project(
        id=pid,
        software_id=uuid.uuid4(),
        name="P",
        description=None,
        publish_folder_slug="p",
    )
    sw = Software(
        id=pr.software_id,
        studio_id=uuid.uuid4(),
        name="Sw",
        description="d",
        definition=None,
    )
    db.get = AsyncMock(side_effect=[wo, sec, pr, sw])

    body = WorkOrderUpdate(
        title="  new  ",
        description="  nd  ",
        implementation_guide="",
        acceptance_criteria="",
        status="in_review",
        phase="  np  ",
        phase_order=9,
        assignee_id=aid,
        section_ids=[sid],
    )
    actor = uuid.uuid4()
    out = await WorkOrderService(db).update(pid, wid, body, actor_id=actor)
    assert out.title == "new"
    assert wo.implementation_guide is None
    assert wo.acceptance_criteria is None
    assert wo.status == "in_review"
    assert wo.phase == "np"
    assert wo.phase_order == 9
    assert wo.assignee_id == aid
    assert wo.updated_by_id == actor


@pytest.mark.asyncio
async def test_update_phase_explicit_none() -> None:
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
        is_stale=False,
        stale_reason=None,
    )
    wo.phase = "was"
    sec_map_ex = MagicMock()
    sec_map_ex.all.return_value = []
    db = MagicMock()
    db.get = AsyncMock(return_value=wo)
    db.flush = AsyncMock()
    db.refresh = AsyncMock()
    db.execute = AsyncMock(return_value=sec_map_ex)
    await WorkOrderService(db).update(
        pid, wid, WorkOrderUpdate(phase=None, description=None), actor_id=uuid.uuid4()
    )
    assert wo.phase is None


@pytest.mark.asyncio
async def test_add_note_success() -> None:
    pid, wid, aid = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    now = datetime.now(timezone.utc)
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
    note = WorkOrderNote(
        id=uuid.uuid4(),
        work_order_id=wid,
        author_id=aid,
        source="user",
        content="c",
        created_at=now,
    )
    db = MagicMock()
    db.get = AsyncMock(return_value=wo)
    db.add = MagicMock()
    db.flush = AsyncMock()

    async def refresh_note(n: WorkOrderNote) -> None:
        n.id = note.id
        n.created_at = now

    db.refresh = AsyncMock(side_effect=refresh_note)

    out = await WorkOrderService(db).add_note(
        pid,
        wid,
        WorkOrderNoteCreate(content="  hello  "),
        author_id=aid,
    )
    assert out.content == "hello"


@pytest.mark.asyncio
async def test_dismiss_stale_success() -> None:
    pid, wid, uid = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    now = datetime.now(timezone.utc)
    wo = WorkOrder(
        id=wid,
        project_id=pid,
        title="t",
        description="d",
        status="backlog",
        created_at=now,
        updated_at=now,
        is_stale=True,
        stale_reason="old",
    )
    sec_map_ex = MagicMock()
    sec_map_ex.all.return_value = []
    db = MagicMock()
    db.get = AsyncMock(return_value=wo)
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()
    db.execute = AsyncMock(return_value=sec_map_ex)

    out = await WorkOrderService(db).dismiss_stale(pid, wid, user_id=uid)
    assert wo.is_stale is False
    assert wo.stale_reason is None
    assert wo.stale_dismissed_by == uid
    assert out.is_stale is False


@pytest.mark.asyncio
async def test_generate_project_not_found() -> None:
    db = MagicMock()
    db.get = AsyncMock(return_value=None)
    with pytest.raises(ApiError) as e:
        await WorkOrderService(db).generate_work_orders(
            uuid.uuid4(),
            GenerateWorkOrdersBody(section_ids=[uuid.uuid4()]),
            user_id=uuid.uuid4(),
        )
    assert e.value.error_code == "NOT_FOUND"


@pytest.mark.asyncio
async def test_generate_software_not_found() -> None:
    pid = uuid.uuid4()
    pr = Project(
        id=pid,
        software_id=uuid.uuid4(),
        name="P",
        description=None,
        publish_folder_slug="p",
    )
    db = MagicMock()
    db.get = AsyncMock(side_effect=[pr, None])
    with pytest.raises(ApiError) as e:
        await WorkOrderService(db).generate_work_orders(
            pid,
            GenerateWorkOrdersBody(section_ids=[uuid.uuid4()]),
            user_id=uuid.uuid4(),
        )
    assert "Software" in (e.value.detail or "")


@pytest.mark.asyncio
async def test_generate_invalid_section() -> None:
    pid = uuid.uuid4()
    pr = Project(
        id=pid,
        software_id=uuid.uuid4(),
        name="P",
        description=None,
        publish_folder_slug="p",
    )
    sw = Software(
        id=pr.software_id,
        studio_id=uuid.uuid4(),
        name="S",
        description="d",
        definition=None,
    )
    db = MagicMock()
    empty_sec = MagicMock()
    empty_sec.scalars.return_value.all.return_value = []
    db.get = AsyncMock(side_effect=[pr, sw])
    db.execute = AsyncMock(return_value=empty_sec)
    with pytest.raises(ApiError) as e:
        await WorkOrderService(db).generate_work_orders(
            pid,
            GenerateWorkOrdersBody(section_ids=[uuid.uuid4()]),
            user_id=uuid.uuid4(),
        )
    assert e.value.error_code == "INVALID_SECTION"


@pytest.mark.asyncio
async def test_generate_success_with_graph_and_skips(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pid = uuid.uuid4()
    uid = uuid.uuid4()
    sec_id = uuid.uuid4()
    pr = Project(
        id=pid,
        software_id=uuid.uuid4(),
        name="P",
        description=None,
        publish_folder_slug="p",
    )
    sw = Software(
        id=pr.software_id,
        studio_id=uuid.uuid4(),
        name="SwName",
        description="d",
        definition="  def  ",
    )
    sec = Section(
        id=sec_id,
        project_id=pid,
        title="Sec",
        slug="sec-slug",
        order=0,
        content="body",
    )
    sec_ex = MagicMock()
    sec_ex.scalars.return_value.all.return_value = [sec]

    db = MagicMock()
    db.get = AsyncMock(side_effect=[pr, sw])

    llm_items = {
        "items": [
            {
                "title": "  Real  ",
                "description": "  RD  ",
                "implementation_guide": "ig",
                "acceptance_criteria": "ac",
                "linked_section_slugs": [
                    "sec-slug",
                    "unknown-slug",
                    123,
                    "sec-slug",
                ],
            },
            {"title": "", "description": "x", "linked_section_slugs": []},
            {"title": "x", "description": "", "linked_section_slugs": []},
            {
                "title": "T4",
                "description": "D4",
                "linked_section_slugs": {"not": "a-list"},
            },
        ]
    }

    async def fake_chat_structured(self: object, **kwargs: object) -> dict:
        return llm_items

    monkeypatch.setattr(
        "app.services.work_order_service.LLMService.chat_structured",
        fake_chat_structured,
    )
    add_edge = AsyncMock()
    monkeypatch.setattr(
        "app.services.work_order_service.GraphService.add_edge",
        add_edge,
    )

    db.add = MagicMock()
    now_ts = datetime.now(timezone.utc)

    async def flush_fill_wo() -> None:
        for call in db.add.call_args_list:
            o = call[0][0]
            if isinstance(o, WorkOrder):
                o.created_at = o.created_at or now_ts
                o.updated_at = o.updated_at or now_ts
                if o.is_stale is None:
                    o.is_stale = False

    db.flush = AsyncMock(side_effect=flush_fill_wo)

    sec_map_ex = MagicMock()
    sec_map_ex.all.return_value = []

    exec_n = 0

    async def exec_after_gen(*a: object, **k: object) -> MagicMock:
        nonlocal exec_n
        exec_n += 1
        if exec_n == 1:
            return sec_ex
        return sec_map_ex

    db.execute = AsyncMock(side_effect=exec_after_gen)

    out = await WorkOrderService(db).generate_work_orders(
        pid,
        GenerateWorkOrdersBody(section_ids=[sec_id]),
        user_id=uid,
    )
    assert len(out) == 2
    titles = {x.title for x in out}
    assert "Real" in titles and "T4" in titles
    assert add_edge.await_count >= 1


@pytest.mark.asyncio
async def test_generate_empty_items_list_records_usage_paths(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """All LLM items skipped → empty created; still exercises tail sec_map + assignee."""
    pid = uuid.uuid4()
    pr = Project(
        id=pid,
        software_id=uuid.uuid4(),
        name="P",
        description=None,
        publish_folder_slug="p",
    )
    sw = Software(
        id=pr.software_id,
        studio_id=uuid.uuid4(),
        name="S",
        description="d",
        definition="x",
    )
    sec = Section(
        id=uuid.uuid4(),
        project_id=pid,
        title="A",
        slug="a",
        order=0,
        content="c",
    )
    sec_ex = MagicMock()
    sec_ex.scalars.return_value.all.return_value = [sec]

    db = MagicMock()
    db.get = AsyncMock(side_effect=[pr, sw])

    async def empty_items(self: object, **kwargs: object) -> dict:
        return {"items": [{"title": "", "description": ""}]}

    monkeypatch.setattr(
        "app.services.work_order_service.LLMService.chat_structured",
        empty_items,
    )
    sec_map_ex = MagicMock()
    sec_map_ex.all.return_value = []

    exec_n = 0

    async def exec_empty(*a: object, **k: object) -> MagicMock:
        nonlocal exec_n
        exec_n += 1
        if exec_n == 1:
            return sec_ex
        return sec_map_ex

    db.execute = AsyncMock(side_effect=exec_empty)
    db.add = MagicMock()
    db.flush = AsyncMock()

    out = await WorkOrderService(db).generate_work_orders(
        pid,
        GenerateWorkOrdersBody(section_ids=[sec.id]),
        user_id=uuid.uuid4(),
    )
    assert out == []


@pytest.mark.asyncio
async def test_add_work_order_dependency_success(monkeypatch: pytest.MonkeyPatch) -> None:
    pid = uuid.uuid4()
    dep, tgt = uuid.uuid4(), uuid.uuid4()
    now = datetime.now(timezone.utc)

    def make_wo(wid: uuid.UUID) -> WorkOrder:
        return WorkOrder(
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

    db = MagicMock()
    db.get = AsyncMock(side_effect=[make_wo(dep), make_wo(tgt)])
    db.flush = AsyncMock()
    add_edge = AsyncMock()
    monkeypatch.setattr(
        "app.services.work_order_service.GraphService.add_edge",
        add_edge,
    )
    await WorkOrderService(db).add_work_order_dependency(pid, tgt, dep)
    add_edge.assert_awaited_once()


@pytest.mark.asyncio
async def test_remove_work_order_dependency_success() -> None:
    pid = uuid.uuid4()
    dep, tgt = uuid.uuid4(), uuid.uuid4()
    now = datetime.now(timezone.utc)

    def make_wo(wid: uuid.UUID) -> WorkOrder:
        return WorkOrder(
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

    edge = MagicMock()
    ex = MagicMock()
    ex.scalar_one_or_none.return_value = edge
    db = MagicMock()
    db.get = AsyncMock(side_effect=[make_wo(tgt), make_wo(dep)])
    db.execute = AsyncMock(return_value=ex)
    db.delete = AsyncMock()
    db.flush = AsyncMock()
    await WorkOrderService(db).remove_work_order_dependency(pid, tgt, dep)
    db.delete.assert_awaited_once_with(edge)
