"""Additional HTTP contract checks (tests.mdc route coverage)."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_me_without_auth_returns_401(client: AsyncClient) -> None:
    r = await client.get("/auth/me")
    assert r.status_code == 401
    assert r.json()["code"] == "UNAUTHORIZED"


@pytest.mark.asyncio
async def test_admin_users_without_auth_returns_401(client: AsyncClient) -> None:
    r = await client.get("/admin/users")
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


@pytest.mark.asyncio
async def test_login_rate_limit_21st_request_returns_429(client: AsyncClient) -> None:
    """POST /auth/login is limited to 20/minute per client IP."""
    from app.main import limiter

    limiter.reset()
    payload = {"email": "rate-limit@example.com", "password": "wrong-password"}
    for _ in range(20):
        r = await client.post("/auth/login", json=payload)
        assert r.status_code != 429, "unexpected 429 before limit"
    r21 = await client.post("/auth/login", json=payload)
    assert r21.status_code == 429


@pytest.mark.asyncio
async def test_register_password_over_bcrypt_byte_limit_returns_422(
    client: AsyncClient,
) -> None:
    """bcrypt rejects passwords > 72 UTF-8 bytes; reject before hashing."""
    too_long = "a" * 73
    r = await client.post(
        "/auth/register",
        json={
            "email": "longpw-user@example.com",
            "password": too_long,
            "display_name": "Test",
        },
    )
    assert r.status_code == 422
    assert r.json()["code"] == "VALIDATION_ERROR"
