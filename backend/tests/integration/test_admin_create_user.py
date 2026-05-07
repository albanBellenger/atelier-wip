"""POST /admin/users — platform admin user provisioning."""

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
async def test_admin_create_user_ok_for_platform_admin(
    client: AsyncClient,
    db_session,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    admin_email = f"cu-pa-{sfx}@example.com"
    await client.post(
        "/auth/register",
        json={
            "email": admin_email,
            "password": "securepass123",
            "display_name": "PA",
        },
    )
    await db_session.execute(
        update(User)
        .where(User.email == admin_email.lower())
        .values(is_platform_admin=True)
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
    assert body["is_platform_admin"] is False
    assert "id" in body


@pytest.mark.asyncio
async def test_admin_create_user_duplicate_email_conflict(
    client: AsyncClient,
    db_session,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    admin_email = f"cu-dup-a-{sfx}@example.com"
    dup_email = f"cu-dup-target-{sfx}@example.com"
    await client.post(
        "/auth/register",
        json={
            "email": admin_email,
            "password": "securepass123",
            "display_name": "PA",
        },
    )
    await db_session.execute(
        update(User)
        .where(User.email == admin_email.lower())
        .values(is_platform_admin=True)
    )
    await db_session.flush()

    r_login = await client.post(
        "/auth/login",
        json={"email": admin_email, "password": "securepass123"},
    )
    assert r_login.status_code == 200
    client.cookies.set("atelier_token", r_login.cookies.get("atelier_token"))

    first = await client.post(
        "/admin/users",
        json={
            "email": dup_email,
            "password": "securepass123",
            "display_name": "One",
        },
    )
    assert first.status_code == 201

    second = await client.post(
        "/admin/users",
        json={
            "email": dup_email,
            "password": "securepass123",
            "display_name": "Two",
        },
    )
    assert second.status_code == 409
