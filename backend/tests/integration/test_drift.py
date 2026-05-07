"""Drift detection after section changes (Slice 8)."""

import asyncio
import uuid
from contextlib import asynccontextmanager

import pytest
from httpx import AsyncClient
from sqlalchemy import select, update

from app.models import WorkOrder
from app.models.work_order import WorkOrderNote
from app.services import drift_pipeline
from app.agents.drift_agent import DriftAgent
from app.services.llm_service import LLMService

from tests.integration.test_work_orders import _studio_project_with_sections


@pytest.mark.asyncio
async def test_drift_service_marks_work_order_stale(
    client: AsyncClient,
    db_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _studio_id, _software_id, pid, sec_a, _sec_b = (
        await _studio_project_with_sections(client, sfx)
    )
    client.cookies.set("atelier_token", token)

    create = await client.post(
        f"/projects/{pid}/work-orders",
        json={
            "title": "WO",
            "description": "Do thing",
            "status": "backlog",
            "section_ids": [sec_a],
        },
    )
    assert create.status_code == 200
    wid = uuid.UUID(create.json()["id"])

    async def fake_ready(_self: LLMService, **_kw: object) -> None:
        return None

    async def fake_chat(_self: LLMService, **_kwargs: object) -> dict[str, object]:
        return {"likely_stale": True, "reason": "Spec now requires another approach."}

    monkeypatch.setattr(LLMService, "ensure_openai_llm_ready", fake_ready)
    monkeypatch.setattr(LLMService, "chat_structured", fake_chat)

    await DriftAgent(db_session, LLMService(db_session)).run_after_section_change(
        uuid.UUID(sec_a)
    )
    await db_session.flush()

    wo = await db_session.get(WorkOrder, wid)
    assert wo is not None
    assert wo.is_stale is True
    assert wo.stale_reason is not None
    assert "another approach" in (wo.stale_reason or "")

    notes_r = await db_session.execute(
        select(WorkOrderNote).where(WorkOrderNote.work_order_id == wid)
    )
    notes = list(notes_r.scalars().all())
    assert any(n.source == "drift_flag" for n in notes)


@pytest.mark.asyncio
async def test_drift_skips_done_work_orders(
    client: AsyncClient,
    db_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _studio_id, _software_id, pid, sec_a, _sec_b = (
        await _studio_project_with_sections(client, sfx)
    )
    client.cookies.set("atelier_token", token)

    create = await client.post(
        f"/projects/{pid}/work-orders",
        json={
            "title": "WO",
            "description": "Do thing",
            "status": "done",
            "section_ids": [sec_a],
        },
    )
    assert create.status_code == 200
    wid = uuid.UUID(create.json()["id"])

    calls: list[int] = []

    async def fake_ready(_self: LLMService, **_kw: object) -> None:
        return None

    async def fake_chat(_self: LLMService, **_kwargs: object) -> dict[str, object]:
        calls.append(1)
        return {"likely_stale": True, "reason": "should not apply"}

    monkeypatch.setattr(LLMService, "ensure_openai_llm_ready", fake_ready)
    monkeypatch.setattr(LLMService, "chat_structured", fake_chat)

    await DriftAgent(db_session, LLMService(db_session)).run_after_section_change(
        uuid.UUID(sec_a)
    )
    await db_session.flush()

    assert calls == []
    wo = await db_session.get(WorkOrder, wid)
    assert wo is not None
    assert wo.is_stale is False


@pytest.mark.asyncio
async def test_dismiss_stale_appends_audit_note(
    client: AsyncClient,
    db_session,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _studio_id, _software_id, pid, sec_a, _sec_b = (
        await _studio_project_with_sections(client, sfx)
    )
    client.cookies.set("atelier_token", token)

    cr = await client.post(
        f"/projects/{pid}/work-orders",
        json={
            "title": "W",
            "description": "D",
            "status": "backlog",
            "section_ids": [sec_a],
        },
    )
    assert cr.status_code == 200
    wid = cr.json()["id"]

    await db_session.execute(
        update(WorkOrder)
        .where(WorkOrder.id == uuid.UUID(wid))
        .values(is_stale=True, stale_reason="spec changed")
    )
    await db_session.flush()

    dismiss = await client.post(f"/projects/{pid}/work-orders/{wid}/dismiss-stale")
    assert dismiss.status_code == 200

    notes_r = await db_session.execute(
        select(WorkOrderNote).where(WorkOrderNote.work_order_id == uuid.UUID(wid))
    )
    notes = list(notes_r.scalars().all())
    assert any(n.source == "stale_dismiss" for n in notes)


@pytest.mark.asyncio
async def test_drift_pipeline_semaphore_limits_concurrency(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """At most DRIFT_CONCURRENCY drift runs overlap (DB+LLM path after quiet period)."""

    def fake_session_factory():
        @asynccontextmanager
        async def _cm():
            class MockSession:
                async def commit(self) -> None:
                    return None

                async def rollback(self) -> None:
                    return None

            yield MockSession()

        return _cm()

    monkeypatch.setattr(drift_pipeline, "async_session_factory", fake_session_factory)
    monkeypatch.setattr(drift_pipeline, "_DRIFT_DEBOUNCE_S", 0.0)

    active = 0
    peak = 0

    async def fake_run_after_section_change(_self: object, _section_id: uuid.UUID) -> None:
        nonlocal active, peak
        active += 1
        peak = max(peak, active)
        await asyncio.sleep(0.05)
        active -= 1

    monkeypatch.setattr(
        DriftAgent,
        "run_after_section_change",
        fake_run_after_section_change,
    )

    section_ids = [uuid.uuid4() for _ in range(6)]
    await asyncio.gather(
        *(
            drift_pipeline._run_drift_after_quiet(sid)
            for sid in section_ids
        )
    )

    assert peak <= drift_pipeline._DRIFT_CONCURRENCY


@pytest.mark.asyncio
async def test_schedule_drift_check_cancels_prior_tasks_cleanup(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    created: list[asyncio.Task[None]] = []
    real_create_task = asyncio.create_task

    def capture_create_task(coro, **kwargs):
        t = real_create_task(coro, **kwargs)
        created.append(t)
        return t

    monkeypatch.setattr(asyncio, "create_task", capture_create_task)

    section_id = uuid.uuid4()
    drift_pipeline.schedule_drift_check(section_id)
    drift_pipeline.schedule_drift_check(section_id)
    drift_pipeline.schedule_drift_check(section_id)

    await asyncio.sleep(0)

    assert section_id in drift_pipeline._pending_drift
    assert len(drift_pipeline._pending_drift) == 1
    assert drift_pipeline._pending_drift[section_id] is created[-1]
    assert created[0].done() and created[0].cancelled()
    assert created[1].done() and created[1].cancelled()
    assert not created[2].done()

    created[2].cancel()
    try:
        await created[2]
    except asyncio.CancelledError:
        pass
    drift_pipeline._pending_drift.pop(section_id, None)
