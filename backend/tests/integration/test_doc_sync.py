"""Integration: doc sync manual route + WO-done background hook (Slice 16f)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CodebaseFile, CodebaseSnapshot, CrossStudioAccess, Issue, Section, WorkOrder
from app.models.work_order import WorkOrderSection
from tests.factories import (
    add_studio_member,
    create_project,
    create_software,
    create_studio,
    create_user,
)

_PW = "securepass123"


async def _login(client: AsyncClient, email: str) -> None:
    client.cookies.clear()
    r = await client.post("/auth/login", json={"email": email, "password": _PW})
    assert r.status_code == 200, r.text
    token = r.cookies.get("atelier_token")
    assert token
    client.cookies.set("atelier_token", str(token))


def _ready_snapshot(sw_id: uuid.UUID) -> CodebaseSnapshot:
    return CodebaseSnapshot(
        id=uuid.uuid4(),
        software_id=sw_id,
        commit_sha="a" * 40,
        branch="main",
        status="ready",
        ready_at=datetime.now(timezone.utc),
    )


@pytest.mark.asyncio
async def test_doc_sync_manual_happy_path(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    owner = await create_user(db_session, email=f"ds-{sfx}@example.com", password=_PW)
    studio = await create_studio(db_session, name=f"DS{sfx}")
    await add_studio_member(db_session, studio.id, owner.id, role="studio_admin")
    sw = await create_software(db_session, studio.id, name="SW", definition="Product")
    proj = await create_project(db_session, sw.id, name="Pr", publish_folder_slug=f"p{sfx}")
    doc_sec = Section(
        id=uuid.uuid4(),
        project_id=None,
        software_id=sw.id,
        title="Auth",
        slug="auth",
        order=0,
        content="Login uses bearer tokens for API access.",
    )
    db_session.add(doc_sec)
    wo = WorkOrder(
        id=uuid.uuid4(),
        project_id=proj.id,
        title="Add OAuth",
        description="Implement bearer token login for the API.",
        acceptance_criteria="Tokens must validate on each request.",
        status="in_progress",
        created_by=owner.id,
    )
    db_session.add(wo)
    snap = _ready_snapshot(sw.id)
    db_session.add(snap)
    db_session.add(
        CodebaseFile(
            id=uuid.uuid4(),
            snapshot_id=snap.id,
            path="auth.py",
            blob_sha="b" * 40,
            size_bytes=4,
        )
    )
    await db_session.commit()

    async def fake_propose(_self: object, **_kwargs: object) -> dict[str, object]:
        return {
            "proposals": [
                {
                    "section_id": str(doc_sec.id),
                    "rationale": "Docs should mention OAuth alongside bearer tokens.",
                    "replacement_markdown": "Login uses OAuth2 and bearer tokens.",
                }
            ]
        }

    monkeypatch.setattr(
        "app.services.doc_sync_service.DocSyncAgent.propose_patches",
        fake_propose,
    )
    monkeypatch.setattr(
        "app.services.doc_sync_service.CodebaseRagService.retrieve_chunks_for_text",
        AsyncMock(
            return_value=[
                {
                    "path": "auth.py",
                    "snippet": "def validate",
                    "start_line": 1,
                    "end_line": 5,
                    "score": 0.1,
                }
            ]
        ),
    )

    await _login(client, owner.email)
    r = await client.post(f"/projects/{proj.id}/work-orders/{wo.id}/doc-sync/run", json={})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["proposals_kept"] == 1
    assert body["proposals_dropped"] == 0

    lst = (await client.get(f"/projects/{proj.id}/issues")).json()
    kinds = [x for x in lst if x.get("kind") == "doc_update_suggested"]
    assert len(kinds) >= 1
    row = kinds[0]
    assert row["work_order_id"] == str(wo.id)
    assert row["section_a_id"] == str(doc_sec.id)
    assert row["project_id"] is None
    assert row["software_id"] == str(sw.id)


@pytest.mark.asyncio
async def test_doc_sync_manual_not_indexed(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    owner = await create_user(db_session, email=f"ds-ni-{sfx}@example.com", password=_PW)
    studio = await create_studio(db_session, name=f"DSNI{sfx}")
    await add_studio_member(db_session, studio.id, owner.id, role="studio_admin")
    sw = await create_software(db_session, studio.id, name="SW2")
    proj = await create_project(db_session, sw.id, name="P2", publish_folder_slug=f"p2{sfx}")
    doc_sec = Section(
        id=uuid.uuid4(),
        project_id=None,
        software_id=sw.id,
        title="Doc",
        slug="doc",
        order=0,
        content="Hello world token",
    )
    db_session.add(doc_sec)
    wo = WorkOrder(
        id=uuid.uuid4(),
        project_id=proj.id,
        title="T",
        description="token",
        status="backlog",
        created_by=owner.id,
    )
    db_session.add(wo)
    await db_session.commit()

    await _login(client, owner.email)
    r = await client.post(f"/projects/{proj.id}/work-orders/{wo.id}/doc-sync/run", json={})
    assert r.status_code == 200, r.text
    assert r.json().get("skipped_reason") == "not_indexed"


@pytest.mark.asyncio
async def test_doc_sync_rbac_cross_studio_and_auth(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    owner = await create_user(db_session, email=f"ds-rb-{sfx}@example.com", password=_PW)
    viewer = await create_user(db_session, email=f"ds-v-{sfx}@example.com", password=_PW)
    studio = await create_studio(db_session, name=f"DSRB{sfx}")
    await add_studio_member(db_session, studio.id, owner.id, role="studio_admin")
    await add_studio_member(db_session, studio.id, viewer.id, role="studio_viewer")
    sw = await create_software(db_session, studio.id, name="SWRB")
    proj = await create_project(db_session, sw.id, name="PRB", publish_folder_slug=f"prb{sfx}")
    wo = WorkOrder(
        id=uuid.uuid4(),
        project_id=proj.id,
        title="W",
        description="d",
        status="backlog",
        created_by=owner.id,
    )
    db_session.add(wo)
    snap = _ready_snapshot(sw.id)
    db_session.add(snap)
    db_session.add(
        CodebaseFile(
            id=uuid.uuid4(),
            snapshot_id=snap.id,
            path="x.py",
            blob_sha="b" * 40,
            size_bytes=1,
        )
    )
    await db_session.commit()

    na = await client.post(f"/projects/{proj.id}/work-orders/{wo.id}/doc-sync/run", json={})
    assert na.status_code == 401

    await _login(client, viewer.email)
    vf = await client.post(f"/projects/{proj.id}/work-orders/{wo.id}/doc-sync/run", json={})
    assert vf.status_code == 403

    ext = await create_user(db_session, email=f"ds-ext-{sfx}@example.com", password=_PW)
    st_b = await create_studio(db_session, name=f"DSB{sfx}")
    await add_studio_member(db_session, st_b.id, ext.id, role="studio_member")
    grant = CrossStudioAccess(
        id=uuid.uuid4(),
        requesting_studio_id=st_b.id,
        target_software_id=sw.id,
        requested_by=ext.id,
        approved_by=owner.id,
        access_level="external_editor",
        status="approved",
        resolved_at=datetime.now(timezone.utc),
    )
    db_session.add(grant)
    await db_session.commit()
    await _login(client, ext.email)
    xf = await client.post(f"/projects/{proj.id}/work-orders/{wo.id}/doc-sync/run", json={})
    assert xf.status_code == 403


@pytest.mark.asyncio
async def test_work_order_status_done_schedules_doc_sync(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    scheduled: list[tuple[uuid.UUID, uuid.UUID]] = []

    async def spy_enqueue(wid: uuid.UUID, run_actor_id: uuid.UUID) -> None:
        scheduled.append((wid, run_actor_id))

    monkeypatch.setattr(
        "app.routers.work_orders.enqueue_doc_sync_for_work_order",
        spy_enqueue,
    )

    sfx = uuid.uuid4().hex[:8]
    owner = await create_user(db_session, email=f"ds-bg-{sfx}@example.com", password=_PW)
    studio = await create_studio(db_session, name=f"DSBG{sfx}")
    await add_studio_member(db_session, studio.id, owner.id, role="studio_admin")
    sw = await create_software(db_session, studio.id, name="SWBG")
    proj = await create_project(db_session, sw.id, name="PBG", publish_folder_slug=f"pbg{sfx}")
    sec = Section(
        id=uuid.uuid4(),
        project_id=proj.id,
        software_id=None,
        title="S",
        slug="s",
        order=0,
        content="c",
    )
    db_session.add(sec)
    await db_session.flush()
    wo = WorkOrder(
        id=uuid.uuid4(),
        project_id=proj.id,
        title="W",
        description="d",
        status="in_progress",
        created_by=owner.id,
    )
    db_session.add(wo)
    db_session.add(WorkOrderSection(work_order_id=wo.id, section_id=sec.id))
    await db_session.commit()

    await _login(client, owner.email)
    r = await client.put(
        f"/projects/{proj.id}/work-orders/{wo.id}",
        json={"status": "done"},
    )
    assert r.status_code == 200, r.text
    assert len(scheduled) == 1
    assert scheduled[0][0] == wo.id


@pytest.mark.asyncio
async def test_doc_sync_resolve_issue_with_applied_reason(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    owner = await create_user(db_session, email=f"ds-iss-{sfx}@example.com", password=_PW)
    studio = await create_studio(db_session, name=f"DSI{sfx}")
    await add_studio_member(db_session, studio.id, owner.id, role="studio_admin")
    sw = await create_software(db_session, studio.id, name="SWI")
    proj = await create_project(db_session, sw.id, name="PI", publish_folder_slug=f"pi{sfx}")
    issue = Issue(
        id=uuid.uuid4(),
        project_id=None,
        software_id=sw.id,
        work_order_id=None,
        kind="doc_update_suggested",
        section_a_id=uuid.uuid4(),
        description="r",
        status="open",
        origin="auto",
        run_actor_id=owner.id,
        payload_json={"replacement_markdown": "x"},
    )
    db_session.add(issue)
    await db_session.commit()

    await _login(client, owner.email)
    up = await client.put(
        f"/projects/{proj.id}/issues/{issue.id}",
        json={"status": "resolved", "resolution_reason": "applied"},
    )
    assert up.status_code == 200, up.text
    assert up.json()["status"] == "resolved"
    assert up.json().get("resolution_reason") == "applied"
