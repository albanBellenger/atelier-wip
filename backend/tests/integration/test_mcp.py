"""MCP API key + work-order pull (Slice 12)."""

import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.main import app
from app.models import TokenUsage
from tests.integration.test_work_orders import _studio_project_with_sections


@pytest.mark.asyncio
async def test_mcp_invalid_key_401(client: AsyncClient) -> None:
    r = await client.get(
        "/mcp/v1/work-orders",
        headers={"Authorization": "Bearer wrong"},
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_mcp_list_with_project_filter_records_software_id(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    _token, sid, _sw, pid, sec_a, _b = await _studio_project_with_sections(
        client, db_session, sfx
    )

    client.cookies.set("atelier_token", _token)
    mk = await client.post(
        f"/studios/{sid}/mcp-keys",
        json={"label": "tdev", "access_level": "editor"},
    )
    assert mk.status_code == 200
    secret = mk.json()["secret"]

    wo = await client.post(
        f"/projects/{pid}/work-orders",
        json={
            "title": "Task",
            "description": "Desc",
            "status": "backlog",
            "section_ids": [sec_a],
        },
    )
    assert wo.status_code == 200

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        lst = await ac.get(
            f"/mcp/v1/work-orders?project_id={pid}",
            headers={"Authorization": f"Bearer {secret}"},
        )
    assert lst.status_code == 200

    r = await db_session.execute(
        select(TokenUsage)
        .where(TokenUsage.model == "mcp_list_work_orders")
        .order_by(TokenUsage.created_at.desc())
    )
    row = r.scalars().first()
    assert row is not None
    assert row.software_id is not None


@pytest.mark.asyncio
async def test_mcp_list_filters_status_and_phase(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    sfx = uuid.uuid4().hex[:8]
    _token, _sid, _sw, pid, sec_a, _b = await _studio_project_with_sections(
        client, db_session, sfx
    )

    client.cookies.set("atelier_token", _token)
    mk = await client.post(
        f"/studios/{_sid}/mcp-keys",
        json={"label": "fdev", "access_level": "editor"},
    )
    assert mk.status_code == 200
    secret = mk.json()["secret"]

    w1 = await client.post(
        f"/projects/{pid}/work-orders",
        json={
            "title": "Backlog p1",
            "description": "D",
            "status": "backlog",
            "phase": "phase-1",
            "section_ids": [sec_a],
        },
    )
    assert w1.status_code == 200
    w2 = await client.post(
        f"/projects/{pid}/work-orders",
        json={
            "title": "Active p2",
            "description": "D",
            "status": "in_progress",
            "phase": "phase-2",
            "section_ids": [sec_a],
        },
    )
    assert w2.status_code == 200
    id1 = w1.json()["id"]
    id2 = w2.json()["id"]

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        inprog = await ac.get(
            "/mcp/v1/work-orders?status=in_progress",
            headers={"Authorization": f"Bearer {secret}"},
        )
        assert inprog.status_code == 200
        ids_p = {x["id"] for x in inprog.json().get("work_orders", [])}
        assert id2 in ids_p
        assert id1 not in ids_p

        p1 = await ac.get(
            "/mcp/v1/work-orders?phase=phase-1",
            headers={"Authorization": f"Bearer {secret}"},
        )
        assert p1.status_code == 200
        ids_ph = {x["id"] for x in p1.json().get("work_orders", [])}
        assert id1 in ids_ph
        assert id2 not in ids_ph


@pytest.mark.asyncio
async def test_mcp_key_list_pull_patch_flow(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, sid, _sw, pid, sec_a, _b = await _studio_project_with_sections(
        client, db_session, sfx
    )

    client.cookies.set("atelier_token", token)
    mk = await client.post(
        f"/studios/{sid}/mcp-keys",
        json={"label": "dev", "access_level": "editor"},
    )
    assert mk.status_code == 200
    secret = mk.json()["secret"]

    wo = await client.post(
        f"/projects/{pid}/work-orders",
        json={
            "title": "Task",
            "description": "Desc",
            "status": "backlog",
            "section_ids": [sec_a],
        },
    )
    assert wo.status_code == 200
    wid = wo.json()["id"]

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        bad = await ac.get("/mcp/v1/work-orders")
        assert bad.status_code == 401

        lst = await ac.get(
            "/mcp/v1/work-orders",
            headers={"Authorization": f"Bearer {secret}"},
        )
        assert lst.status_code == 200
        ids = [x["id"] for x in lst.json().get("work_orders", [])]
        assert wid in ids

        pull = await ac.get(
            f"/mcp/v1/work-orders/{wid}",
            headers={"Authorization": f"Bearer {secret}"},
        )
        assert pull.status_code == 200
        body = pull.json()
        assert body["title"] == "Task"
        assert "linked_sections" in body

        patch = await ac.patch(
            f"/mcp/v1/work-orders/{wid}",
            headers={"Authorization": f"Bearer {secret}"},
            json={"status": "in_progress"},
        )
        assert patch.status_code == 200

        viewer_mk = await client.post(
            f"/studios/{sid}/mcp-keys",
            json={"label": "read", "access_level": "viewer"},
        )
        assert viewer_mk.status_code == 200
        vsecret = viewer_mk.json()["secret"]

        forbidden = await ac.patch(
            f"/mcp/v1/work-orders/{wid}",
            headers={"Authorization": f"Bearer {vsecret}"},
            json={"status": "backlog"},
        )
        assert forbidden.status_code == 403

        invalid = await ac.patch(
            f"/mcp/v1/work-orders/{wid}",
            headers={"Authorization": f"Bearer {secret}"},
            json={"status": "not_a_valid_status"},
        )
        assert invalid.status_code == 400
        assert invalid.json()["code"] == "BAD_REQUEST"


@pytest.mark.asyncio
async def test_mcp_pull_includes_related_work_orders_after_dependency(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """MCP pull lists prerequisite WO when edge_type is depends_on (FR graph)."""
    sfx = uuid.uuid4().hex[:8]
    token, sid, _sw, pid, sec_a, _b = await _studio_project_with_sections(
        client, db_session, sfx
    )

    client.cookies.set("atelier_token", token)
    mk = await client.post(
        f"/studios/{sid}/mcp-keys",
        json={"label": "dep", "access_level": "editor"},
    )
    assert mk.status_code == 200
    secret = mk.json()["secret"]

    wo = await client.post(
        f"/projects/{pid}/work-orders",
        json={
            "title": "Prereq",
            "description": "P",
            "status": "backlog",
            "section_ids": [sec_a],
        },
    )
    assert wo.status_code == 200
    wid_pre = wo.json()["id"]

    wo2 = await client.post(
        f"/projects/{pid}/work-orders",
        json={
            "title": "Dependent",
            "description": "D",
            "status": "backlog",
            "section_ids": [sec_a],
        },
    )
    assert wo2.status_code == 200
    wid_dep = wo2.json()["id"]

    dep = await client.post(
        f"/projects/{pid}/work-orders/{wid_dep}/dependencies/{wid_pre}",
    )
    assert dep.status_code == 201

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        pull = await ac.get(
            f"/mcp/v1/work-orders/{wid_dep}",
            headers={"Authorization": f"Bearer {secret}"},
        )
    assert pull.status_code == 200
    related = pull.json().get("related_work_orders") or []
    titles = {x.get("title") for x in related}
    assert "Prereq" in titles
