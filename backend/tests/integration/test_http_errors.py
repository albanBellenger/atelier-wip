"""Additional HTTP contract checks (tests.mdc route coverage)."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_me_without_auth_returns_401(client: AsyncClient) -> None:
    r = await client.get("/auth/me")
    assert r.status_code == 401
    assert r.json()["code"] == "UNAUTHORIZED"


@pytest.mark.asyncio
async def test_admin_config_without_auth_returns_401(client: AsyncClient) -> None:
    r = await client.get("/admin/config")
    assert r.status_code == 401
    assert r.json()["code"] == "UNAUTHORIZED"


@pytest.mark.asyncio
async def test_register_invalid_email_returns_422(client: AsyncClient) -> None:
    r = await client.post(
        "/auth/register",
        json={
            "email": "not-an-email",
            "password": "securepass123",
            "display_name": "Test",
        },
    )
    assert r.status_code == 422
    assert r.json()["code"] == "VALIDATION_ERROR"
