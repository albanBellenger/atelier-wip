"""Tool-admin POST /admin/users (provision account without switching session)."""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import update

from app.models import User


@pytest.mark.asyncio
async def test_admin_create_user_unauthenticated(client: AsyncClient) -> None:
    r = await client.post(
        "/admin/users",
        json={
            "email": "x@example.com",
            "password": "securepass123",
            "display_name": "X",
        },
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_admin_create_user_forbidden_for_member(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    owner_email = f"cu-own-{sfx}@example.com"
    await client.post(
        "/auth/register",
        json={
            "email": owner_email,
            "password": "securepass123",
            "display_name": "Owner",
        },
    )
    r_login = await client.post(
        "/auth/login",
        json={"email": owner_email, "password": "securepass123"},
    )
    assert r_login.status_code == 200
    client.cookies.set("atelier_token", r_login.cookies.get("atelier_token"))

    denied = await client.post(
        "/admin/users",
        json={
            "email": f"cu-new-{sfx}@example.com",
            "password": "securepass123",
            "display_name": "N",
        },
    )
    assert denied.status_code == 403


@pytest.mark.asyncio
async def test_admin_create_user_tool_admin_201_and_409(
    client: AsyncClient,
    db_session,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    admin_email = f"cu-ta-{sfx}@example.com"
    await client.post(
        "/auth/register",
        json={
            "email": admin_email,
            "password": "securepass123",
            "display_name": "TA",
        },
    )
    await db_session.execute(
        update(User)
        .where(User.email == admin_email.lower())
        .values(is_tool_admin=True)
    )
    await db_session.flush()

    r_login = await client.post(
        "/auth/login",
        json={"email": admin_email, "password": "securepass123"},
    )
    assert r_login.status_code == 200
    tok = r_login.cookies.get("atelier_token")
    assert tok
    client.cookies.set("atelier_token", tok)

    new_email = f"cu-created-{sfx}@example.com"
    r = await client.post(
        "/admin/users",
        json={
            "email": new_email,
            "password": "securepass123",
            "display_name": "Provisioned",
        },
    )
    assert r.status_code == 201
    body = r.json()
    assert body["email"] == new_email.lower()
    assert body["display_name"] == "Provisioned"
    assert body["is_tool_admin"] is False
    assert "id" in body

    dup = await client.post(
        "/admin/users",
        json={
            "email": new_email,
            "password": "securepass123",
            "display_name": "Dup",
        },
    )
    assert dup.status_code == 409
