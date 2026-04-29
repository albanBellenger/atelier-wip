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
    patch = await client.patch(
        f"/software/{software_id}/projects/{pid}",
        json={"name": "Proj A2"},
    )
    assert patch.status_code == 200
    assert patch.json()["name"] == "Proj A2"

    client.cookies.set("atelier_token", token_member)
    forbidden_patch = await client.patch(
        f"/software/{software_id}/projects/{pid}",
        json={"name": "nope"},
    )
    assert forbidden_patch.status_code == 403

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
    gf = await client.get(f"/software/{software_id}/projects")
    assert gf.status_code == 403
