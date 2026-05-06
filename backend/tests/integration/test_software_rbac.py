"""Software update RBAC — definition vs name (FR §6.2 helper + service alignment)."""

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


@pytest_asyncio.fixture(autouse=True)
async def _truncate_users(db_session: AsyncSession) -> None:
    await db_session.execute(text("TRUNCATE TABLE users RESTART IDENTITY CASCADE"))
    await db_session.flush()


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
async def test_owner_put_definition_succeeds(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    token_owner = await _register(client, sfx, "owner")
    client.cookies.set("atelier_token", token_owner)
    studio_id = (await client.post("/studios", json={"name": f"S{sfx}"})).json()["id"]
    sw_id = (
        await client.post(
            f"/studios/{studio_id}/software",
            json={"name": "App", "description": "d"},
        )
    ).json()["id"]

    r = await client.put(
        f"/studios/{studio_id}/software/{sw_id}",
        json={"definition": "x"},
    )
    assert r.status_code == 200
    assert r.json()["definition"] == "x"


@pytest.mark.asyncio
async def test_builder_put_definition_forbidden(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    token_owner = await _register(client, sfx, "owner2")
    token_builder = await _register(client, sfx, "builder2")
    client.cookies.set("atelier_token", token_owner)
    studio_id = (await client.post("/studios", json={"name": f"S2{sfx}"})).json()["id"]
    inv = await client.post(
        f"/studios/{studio_id}/members",
        json={"email": f"builder2-{sfx}@example.com", "role": "studio_member"},
    )
    assert inv.status_code == 200
    sw_id = (
        await client.post(
            f"/studios/{studio_id}/software",
            json={"name": "App2", "description": "d"},
        )
    ).json()["id"]

    client.cookies.set("atelier_token", token_builder)
    r = await client.put(
        f"/studios/{studio_id}/software/{sw_id}",
        json={"definition": "x"},
    )
    assert r.status_code == 403
    assert r.json()["code"] == "FORBIDDEN"


@pytest.mark.asyncio
async def test_builder_put_name_succeeds(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    token_owner = await _register(client, sfx, "owner3")
    token_builder = await _register(client, sfx, "builder3")
    client.cookies.set("atelier_token", token_owner)
    studio_id = (await client.post("/studios", json={"name": f"S3{sfx}"})).json()["id"]
    inv = await client.post(
        f"/studios/{studio_id}/members",
        json={"email": f"builder3-{sfx}@example.com", "role": "studio_member"},
    )
    assert inv.status_code == 200
    sw_id = (
        await client.post(
            f"/studios/{studio_id}/software",
            json={"name": "OldName", "description": "d"},
        )
    ).json()["id"]

    client.cookies.set("atelier_token", token_builder)
    r = await client.put(
        f"/studios/{studio_id}/software/{sw_id}",
        json={"name": "NewName"},
    )
    assert r.status_code == 200
    assert r.json()["name"] == "NewName"


@pytest.mark.asyncio
async def test_cross_studio_external_editor_put_definition_forbidden(
    client: AsyncClient,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token_ta = await _register(client, sfx, "ta")
    client.cookies.set("atelier_token", token_ta)
    studio_a = (
        await client.post("/studios", json={"name": f"A{sfx}", "description": ""})
    ).json()["id"]
    sw_id = (
        await client.post(
            f"/studios/{studio_a}/software",
            json={"name": f"SW{sfx}", "description": ""},
        )
    ).json()["id"]

    token_b = await _register(client, sfx, "adminb")
    client.cookies.set("atelier_token", token_b)
    studio_b = (
        await client.post("/studios", json={"name": f"B{sfx}", "description": ""})
    ).json()["id"]

    token_ext = await _register(client, sfx, "exted")
    client.cookies.set("atelier_token", token_b)
    inv = await client.post(
        f"/studios/{studio_b}/members",
        json={"email": f"exted-{sfx}@example.com", "role": "studio_member"},
    )
    assert inv.status_code == 200

    req = await client.post(
        f"/studios/{studio_b}/cross-studio-request",
        json={
            "target_software_id": sw_id,
            "requested_access_level": "external_editor",
        },
    )
    assert req.status_code == 200
    grant_id = req.json()["id"]

    client.cookies.clear()
    client.cookies.set("atelier_token", token_ta)
    apr = await client.put(
        f"/admin/cross-studio/{grant_id}",
        json={"decision": "approve", "access_level": "external_editor"},
    )
    assert apr.status_code == 200

    client.cookies.clear()
    client.cookies.set("atelier_token", token_ext)
    r = await client.put(
        f"/studios/{studio_a}/software/{sw_id}",
        json={"definition": "injected"},
    )
    assert r.status_code == 403
    assert r.json()["code"] == "FORBIDDEN"
