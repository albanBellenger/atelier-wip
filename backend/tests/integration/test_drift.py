"""Drift detection after section changes (Slice 8)."""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select, update

from app.models import WorkOrder
from app.models.work_order import WorkOrderNote
from app.services.drift_service import DriftService
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

    async def fake_ready(_self: LLMService) -> None:
        return None

    async def fake_chat(_self: LLMService, **_kwargs: object) -> dict[str, object]:
        return {"likely_stale": True, "reason": "Spec now requires another approach."}

    monkeypatch.setattr(LLMService, "ensure_openai_llm_ready", fake_ready)
    monkeypatch.setattr(LLMService, "chat_structured", fake_chat)

    await DriftService(db_session).run_after_section_change(uuid.UUID(sec_a))
    await db_session.commit()

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

    async def fake_ready(_self: LLMService) -> None:
        return None

    async def fake_chat(_self: LLMService, **_kwargs: object) -> dict[str, object]:
        calls.append(1)
        return {"likely_stale": True, "reason": "should not apply"}

    monkeypatch.setattr(LLMService, "ensure_openai_llm_ready", fake_ready)
    monkeypatch.setattr(LLMService, "chat_structured", fake_chat)

    await DriftService(db_session).run_after_section_change(uuid.UUID(sec_a))
    await db_session.commit()

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
