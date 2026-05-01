"""Integration tests for PATCH /auth/me (profile)."""

import uuid

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_patch_me_unauthorized(client: AsyncClient) -> None:
    r = await client.patch("/auth/me", json={"display_name": "X"})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_patch_me_happy(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    reg = await client.post(
        "/auth/register",
        json={
            "email": f"patchme-{sfx}@example.com",
            "password": "securepass123",
            "display_name": "Before",
        },
    )
    assert reg.status_code == 200
    client.cookies.set("atelier_token", reg.cookies.get("atelier_token"))
    r = await client.patch("/auth/me", json={"display_name": "  After Name  "})
    assert r.status_code == 200
    assert r.json()["user"]["display_name"] == "After Name"
    me = await client.get("/auth/me")
    assert me.json()["user"]["display_name"] == "After Name"


@pytest.mark.asyncio
async def test_patch_me_validation_422(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    reg = await client.post(
        "/auth/register",
        json={
            "email": f"patchbad-{sfx}@example.com",
            "password": "securepass123",
            "display_name": "U",
        },
    )
    assert reg.status_code == 200
    client.cookies.set("atelier_token", reg.cookies.get("atelier_token"))
    r = await client.patch("/auth/me", json={"display_name": ""})
    assert r.status_code == 422
