"""Slice 3: projects API."""

import uuid

import pytest
from httpx import AsyncClient


async def _register(client: AsyncClient, suffix: str, label: str) -> str:
    r = await client.post(
        "/auth/register",
        json={
            "email": f"{label}-{suffix}@example.com",
            "password": "securepass123",
            "display_name": label,
        },
    )
    assert r.status_code == 200, r.text
    token = r.cookies.get("atelier_token")
    assert token
    return token


async def _studio_with_software(client: AsyncClient, sfx: str) -> tuple[str, str, str]:
    """Returns (token_admin, studio_id, software_id)."""
    token = await _register(client, sfx, "owner")
    client.cookies.set("atelier_token", token)
    cr = await client.post("/studios", json={"name": f"S{sfx}", "description": "d"})
    assert cr.status_code == 200
    studio_id = cr.json()["id"]
    sw = await client.post(
        f"/studios/{studio_id}/software",
        json={"name": "SW", "description": None},
    )
    assert sw.status_code == 200
    software_id = sw.json()["id"]
    return token, studio_id, software_id


@pytest.mark.asyncio
async def test_projects_crud_and_rbac(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    token_admin, studio_id, software_id = await _studio_with_software(client, sfx)

    token_member = await _register(client, sfx, "member")
    client.cookies.set("atelier_token", token_admin)
    await client.post(
        f"/studios/{studio_id}/members",
        json={"email": f"member-{sfx}@example.com", "role": "studio_member"},
    )

    client.cookies.set("atelier_token", token_member)
    empty = await client.get(f"/software/{software_id}/projects")
    assert empty.status_code == 200
    assert empty.json() == []

    create = await client.post(
        f"/software/{software_id}/projects",
        json={"name": "Proj A", "description": "desc"},
    )
    assert create.status_code == 200
    pid = create.json()["id"]

    client.cookies.set("atelier_token", token_admin)
    put = await client.put(
        f"/software/{software_id}/projects/{pid}",
        json={"name": "Proj A2"},
    )
    assert put.status_code == 200
    assert put.json()["name"] == "Proj A2"

    client.cookies.set("atelier_token", token_member)
    forbidden_put = await client.put(
        f"/software/{software_id}/projects/{pid}",
        json={"name": "nope"},
    )
    assert forbidden_put.status_code == 403

    detail = await client.get(f"/software/{software_id}/projects/{pid}")
    assert detail.status_code == 200
    body = detail.json()
    assert body["name"] == "Proj A2"
    assert body["sections"] == []

    client.cookies.set("atelier_token", token_admin)
    dr = await client.delete(f"/software/{software_id}/projects/{pid}")
    assert dr.status_code == 204

    token_out = await _register(client, sfx, "outsider")
    client.cookies.set("atelier_token", token_out)
    post_out = await client.post(
        f"/software/{software_id}/projects",
        json={"name": "Intruder", "description": None},
    )
    assert post_out.status_code == 403
    gf = await client.get(f"/software/{software_id}/projects")
    assert gf.status_code == 403


@pytest.mark.asyncio
async def test_list_projects_includes_dashboard_aggregates(
    client: AsyncClient,
) -> None:
    """List response includes work order and section rollups for the software dashboard."""
    sfx = uuid.uuid4().hex[:8]
    token, _studio_id, software_id = await _studio_with_software(client, sfx)
    client.cookies.set("atelier_token", token)

    pr = await client.post(
        f"/software/{software_id}/projects",
        json={"name": "DashProj", "description": "A project for dashboard counts"},
    )
    assert pr.status_code == 200, pr.text
    pid = pr.json()["id"]
    assert pr.json()["work_orders_total"] == 0
    assert pr.json()["sections_count"] == 0

    sec = await client.post(
        f"/projects/{pid}/sections",
        json={"title": "S1", "slug": f"s1-{sfx}"},
    )
    assert sec.status_code == 200, sec.text
    sec2 = await client.post(
        f"/projects/{pid}/sections",
        json={"title": "S2", "slug": f"s2-{sfx}"},
    )
    assert sec2.status_code == 200, sec2.text
    sid = sec.json()["id"]

    wo1 = await client.post(
        f"/projects/{pid}/work-orders",
        json={
            "title": "WO backlog",
            "description": "d",
            "status": "backlog",
            "section_ids": [sid],
        },
    )
    assert wo1.status_code == 200, wo1.text
    wo2 = await client.post(
        f"/projects/{pid}/work-orders",
        json={
            "title": "WO done",
            "description": "d",
            "status": "done",
            "section_ids": [sid],
        },
    )
    assert wo2.status_code == 200, wo2.text

    listed = await client.get(f"/software/{software_id}/projects")
    assert listed.status_code == 200, listed.text
    rows = listed.json()
    assert len(rows) == 1
    row = rows[0]
    assert row["id"] == pid
    assert row["sections_count"] == 2
    assert row["work_orders_total"] == 2
    assert row["work_orders_done"] == 1
    assert row["last_edited_at"] is not None
