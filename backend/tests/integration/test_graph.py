"""HTTP tests for project knowledge graph."""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.integration.test_work_orders import _studio_project_with_sections


@pytest.mark.asyncio
async def test_get_graph_requires_member(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _sid, _sw, pid, _a, _b = await _studio_project_with_sections(
        client, db_session, sfx
    )
    del token
    outsider = await client.post(
        "/auth/register",
        json={
            "email": f"out-{sfx}@example.com",
            "password": "securepass123",
            "display_name": "out",
        },
    )
    assert outsider.status_code == 200
    client.cookies.set("atelier_token", outsider.cookies.get("atelier_token"))
    r = await client.get(f"/projects/{pid}/graph")
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_get_graph_dependency_edge(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _sid, _sw, pid, sec_a, _sec_b = await _studio_project_with_sections(
        client, db_session, sfx
    )
    client.cookies.set("atelier_token", token)

    wo = await client.post(
        f"/projects/{pid}/work-orders",
        json={
            "title": "W1",
            "description": "D",
            "status": "backlog",
            "section_ids": [sec_a],
        },
    )
    assert wo.status_code == 200
    wid = wo.json()["id"]

    dup = await client.post(
        f"/projects/{pid}/work-orders/{wid}/dependencies/{wid}",
    )
    assert dup.status_code == 400

    wo2 = await client.post(
        f"/projects/{pid}/work-orders",
        json={
            "title": "W2",
            "description": "D2",
            "status": "backlog",
            "section_ids": [sec_a],
        },
    )
    assert wo2.status_code == 200
    wid2 = wo2.json()["id"]

    ok = await client.post(
        f"/projects/{pid}/work-orders/{wid2}/dependencies/{wid}",
    )
    assert ok.status_code == 201

    r = await client.get(f"/projects/{pid}/graph")
    assert r.status_code == 200
    body = r.json()
    assert "nodes" in body and "edges" in body
    types = {n["entity_type"] for n in body["nodes"]}
    assert "section" in types
    assert "work_order" in types
    edge_types = {e["edge_type"] for e in body["edges"]}
    assert "depends_on" in edge_types
