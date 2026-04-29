"""Slice 3: sections API."""

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
async def test_sections_order_slug_and_rbac(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    token_admin = await _register(client, sfx, "owner")
    client.cookies.set("atelier_token", token_admin)
    cr = await client.post("/studios", json={"name": f"S{sfx}", "description": "d"})
    assert cr.status_code == 200
    studio_id = cr.json()["id"]
    sw = await client.post(
        f"/studios/{studio_id}/software",
        json={"name": "SW"},
    )
    assert sw.status_code == 200
    software_id = sw.json()["id"]
    pr = await client.post(
        f"/software/{software_id}/projects",
        json={"name": "P1"},
    )
    assert pr.status_code == 200
    project_id = pr.json()["id"]

    token_member = await _register(client, sfx, "member")
    client.cookies.set("atelier_token", token_admin)
    await client.post(
        f"/studios/{studio_id}/members",
        json={"email": f"member-{sfx}@example.com", "role": "studio_member"},
    )

    client.cookies.set("atelier_token", token_member)
    forbidden = await client.post(
        f"/projects/{project_id}/sections",
        json={"title": "Intro"},
    )
    assert forbidden.status_code == 403

    client.cookies.set("atelier_token", token_admin)
    s1 = await client.post(
        f"/projects/{project_id}/sections",
        json={"title": "Hello World"},
    )
    assert s1.status_code == 200
    assert s1.json()["slug"] == "hello-world"
    assert s1.json()["order"] == 0

    s2 = await client.post(
        f"/projects/{project_id}/sections",
        json={"title": "Hello World"},
    )
    assert s2.status_code == 200
    assert s2.json()["slug"] == "hello-world-2"
    assert s2.json()["order"] == 1

    lst = await client.get(f"/projects/{project_id}/sections")
    assert lst.status_code == 200
    orders = [x["order"] for x in lst.json()]
    assert orders == [0, 1]

    sid1 = s1.json()["id"]
    patch_order = await client.patch(
        f"/projects/{project_id}/sections/{sid1}",
        json={"order": 5},
    )
    assert patch_order.status_code == 200
    assert patch_order.json()["order"] == 5

    lst2 = await client.get(f"/projects/{project_id}/sections")
    titles_order = [(x["title"], x["order"]) for x in lst2.json()]
    assert titles_order == [("Hello World", 1), ("Hello World", 5)]

    client.cookies.set("atelier_token", token_member)
    ok_read = await client.get(f"/projects/{project_id}/sections/{sid1}")
    assert ok_read.status_code == 200

    patch_content = await client.patch(
        f"/projects/{project_id}/sections/{sid1}",
        json={"content": "Member notes"},
    )
    assert patch_content.status_code == 200, patch_content.text
    assert patch_content.json()["content"] == "Member notes"

    patch_title_forbidden = await client.patch(
        f"/projects/{project_id}/sections/{sid1}",
        json={"title": "Hacked"},
    )
    assert patch_title_forbidden.status_code == 403

    patch_order_forbidden = await client.patch(
        f"/projects/{project_id}/sections/{sid1}",
        json={"order": 0},
    )
    assert patch_order_forbidden.status_code == 403
