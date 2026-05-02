"""Software workspace: attention aggregate, activity, token summary."""

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


async def _studio_software(client: AsyncClient, sfx: str) -> tuple[str, str, str]:
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
async def test_software_attention_activity_token_summary(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, studio_id, software_id = await _studio_software(client, sfx)

    att = await client.get(f"/software/{software_id}/attention")
    assert att.status_code == 200
    body = att.json()
    assert body["software_id"] == software_id
    assert body["counts"]["all"] == 0
    assert body["items"] == []

    act = await client.get(f"/software/{software_id}/activity")
    assert act.status_code == 200
    assert act.json()["items"] == []

    pr = await client.post(
        f"/software/{software_id}/projects",
        json={"name": "P1", "description": None},
    )
    assert pr.status_code == 200
    pid = pr.json()["id"]

    act2 = await client.get(f"/software/{software_id}/activity")
    assert act2.status_code == 200
    items = act2.json()["items"]
    assert len(items) >= 1
    assert items[0]["verb"] == "project_created"
    assert items[0]["actor_display"] == "owner"
    assert items[0]["context_label"] == "P1"

    summ = await client.get(
        f"/studios/{studio_id}/software/{software_id}/token-usage/summary"
    )
    assert summ.status_code == 200
    s = summ.json()
    assert "input_tokens" in s and "output_tokens" in s
    assert "estimated_cost_usd" in s
    assert "period_start" in s and "period_end" in s

    patch = await client.patch(
        f"/software/{software_id}/projects/{pid}",
        json={"archived": True},
    )
    assert patch.status_code == 200
    assert patch.json()["archived"] is True

    listed = await client.get(f"/software/{software_id}/projects")
    assert listed.status_code == 200
    assert listed.json() == []

    listed_all = await client.get(
        f"/software/{software_id}/projects",
        params={"include_archived": "true"},
    )
    assert listed_all.status_code == 200
    assert len(listed_all.json()) == 1


@pytest.mark.asyncio
async def test_software_workspace_requires_auth(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    _, _, software_id = await _studio_software(client, sfx)
    client.cookies.clear()
    r = await client.get(f"/software/{software_id}/attention")
    assert r.status_code == 401
