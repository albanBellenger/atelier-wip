"""Studio landing aggregates: projects, activity, artifacts."""

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


@pytest.mark.asyncio
async def test_studio_projects_activity_artifacts_and_rbac(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, studio_id, software_id_a = await _two_software_studio(client, sfx)

    client.cookies.clear()
    noauth = await client.get(f"/studios/{studio_id}/projects")
    assert noauth.status_code == 401

    token_out = await _register(client, sfx, "outsider")
    client.cookies.set("atelier_token", token_out)
    forbidden = await client.get(f"/studios/{studio_id}/projects")
    assert forbidden.status_code == 403

    client.cookies.set("atelier_token", token)
    nf = await client.get(f"/studios/{uuid.uuid4()}/projects")
    assert nf.status_code == 404

    pr = await client.get(f"/studios/{studio_id}/projects")
    assert pr.status_code == 200
    assert pr.json() == []

    sw_b = await client.post(
        f"/studios/{studio_id}/software",
        json={"name": "SWB", "description": None},
    )
    assert sw_b.status_code == 200
    software_id_b = sw_b.json()["id"]

    p1 = await client.post(
        f"/software/{software_id_a}/projects",
        json={"name": "Alpha", "description": None},
    )
    assert p1.status_code == 200
    p2 = await client.post(
        f"/software/{software_id_b}/projects",
        json={"name": "Beta", "description": None},
    )
    assert p2.status_code == 200

    listed = await client.get(f"/studios/{studio_id}/projects")
    assert listed.status_code == 200
    rows = listed.json()
    assert len(rows) == 2
    names = {(r["name"], r["software_name"]) for r in rows}
    assert ("Alpha", "SWA") in names
    assert ("Beta", "SWB") in names

    act = await client.get(f"/studios/{studio_id}/activity")
    assert act.status_code == 200
    items = act.json()["items"]
    assert len(items) >= 2
    verbs = {i["verb"] for i in items}
    assert "project_created" in verbs
    assert all("software_name" in i for i in items)

    art_a = await client.get(f"/studios/{studio_id}/artifacts")
    assert art_a.status_code == 200
    assert art_a.json() == []

    token_viewer = await _register(client, sfx, "viewer")
    client.cookies.set("atelier_token", token)
    add_v = await client.post(
        f"/studios/{studio_id}/members",
        json={"email": f"viewer-{sfx}@example.com", "role": "studio_viewer"},
    )
    assert add_v.status_code == 200

    client.cookies.set("atelier_token", token_viewer)
    v_projects = await client.get(f"/studios/{studio_id}/projects")
    assert v_projects.status_code == 200
    v_act = await client.get(f"/studios/{studio_id}/activity")
    assert v_act.status_code == 403
    v_art = await client.get(f"/studios/{studio_id}/artifacts")
    assert v_art.status_code == 200


async def _two_software_studio(
    client: AsyncClient, sfx: str
) -> tuple[str, str, str]:
    token = await _register(client, sfx, "owner")
    client.cookies.set("atelier_token", token)
    cr = await client.post("/studios", json={"name": f"S{sfx}", "description": "d"})
    assert cr.status_code == 200
    studio_id = cr.json()["id"]
    sw = await client.post(
        f"/studios/{studio_id}/software",
        json={"name": "SWA", "description": None},
    )
    assert sw.status_code == 200
    software_id_a = sw.json()["id"]
    return token, studio_id, software_id_a
