"""Integration tests for authentication and tool-admin RBAC."""

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AdminConfig


@pytest_asyncio.fixture(autouse=True)
async def _empty_user_table_for_bootstrap(db_session: AsyncSession) -> None:
    """First registered user becomes tool admin only when ``users`` is empty.

    Other integration tests may leave committed rows in the shared ``atelier_test``
    database; this file asserts bootstrap semantics, so start each test with no users.
    """
    await db_session.execute(text("TRUNCATE TABLE users RESTART IDENTITY CASCADE"))
    await db_session.flush()
    yield


@pytest.mark.asyncio
async def test_auth_register_admin_member_rbac_and_login_errors(
    client: AsyncClient,
) -> None:
    """Full slice-1 auth flow: bootstrap tool admin, second user denied admin routes, bad login 401."""
    suffix = uuid.uuid4().hex[:8]
    email_admin = f"admin-{suffix}@example.com"
    email_member = f"member-{suffix}@example.com"

    r1 = await client.post(
        "/auth/register",
        json={
            "email": email_admin,
            "password": "securepass123",
            "display_name": "Tool Admin",
        },
    )
    assert r1.status_code == 200
    assert r1.json() == {"message": "ok"}
    token_admin = r1.cookies.get("atelier_token")
    assert token_admin

    r2 = await client.post(
        "/auth/register",
        json={
            "email": email_member,
            "password": "securepass123",
            "display_name": "Member",
        },
    )
    assert r2.status_code == 200
    assert r2.json() == {"message": "ok"}
    token_member = r2.cookies.get("atelier_token")
    assert token_member

    client.cookies.set("atelier_token", token_admin)
    me_admin = await client.get("/auth/me")
    assert me_admin.json()["user"]["is_tool_admin"] is True

    client.cookies.set("atelier_token", token_member)
    me_member = await client.get("/auth/me")
    assert me_member.json()["user"]["is_tool_admin"] is False

    client.cookies.set("atelier_token", token_admin)
    cfg = await client.get("/admin/config")
    assert cfg.status_code == 200
    assert cfg.json()["llm_api_key_set"] is False

    client.cookies.set("atelier_token", token_member)
    forbidden = await client.get("/admin/config")
    assert forbidden.status_code == 403
    assert forbidden.json()["code"] == "FORBIDDEN"

    bad = await client.post(
        "/auth/login",
        json={"email": "nobody@example.com", "password": "wrongpass1"},
    )
    assert bad.status_code == 401
    assert bad.json()["code"] == "INVALID_CREDENTIALS"


@pytest.mark.asyncio
async def test_admin_put_llm_api_key_encrypted_at_rest_get_returns_suffix_hint(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Fernet at rest for admin LLM key; GET returns a safe suffix hint, not the secret."""
    sfx = uuid.uuid4().hex[:8]
    email = f"adm-{sfx}@example.com"
    reg = await client.post(
        "/auth/register",
        json={
            "email": email,
            "password": "securepass123",
            "display_name": "Tool Admin",
        },
    )
    assert reg.status_code == 200, reg.text
    client.cookies.set("atelier_token", reg.cookies.get("atelier_token"))
    secret = "sk-rotated-TESTKEYabcd"
    put = await client.put(
        "/admin/config",
        json={
            "llm_provider": "openai",
            "llm_model": "gpt-4o-mini",
            "llm_api_key": secret,
        },
    )
    assert put.status_code == 200, put.text
    out = put.json()
    assert out["llm_api_key_set"] is True
    assert out["llm_api_key_hint"] == "…abcd"
    row = await db_session.get(AdminConfig, 1)
    assert row is not None
    assert row.llm_api_key is not None
    assert not str(row.llm_api_key).startswith("sk-")
    get = await client.get("/admin/config")
    assert get.status_code == 200
    assert get.json()["llm_api_key_hint"] == "…abcd"


@pytest.mark.asyncio
async def test_tool_admin_promotion_and_revocation(
    client: AsyncClient,
) -> None:
    # ARRANGE
    suffix = uuid.uuid4().hex[:8]
    email_admin = f"ta-promote-{suffix}@example.com"
    email_member = f"ta-member-{suffix}@example.com"

    r_admin = await client.post(
        "/auth/register",
        json={
            "email": email_admin,
            "password": "securepass123",
            "display_name": "Tool Admin",
        },
    )
    assert r_admin.status_code == 200
    assert r_admin.json() == {"message": "ok"}
    token_admin = r_admin.cookies.get("atelier_token")
    assert token_admin

    r_member = await client.post(
        "/auth/register",
        json={
            "email": email_member,
            "password": "securepass123",
            "display_name": "Member",
        },
    )
    assert r_member.status_code == 200
    assert r_member.json() == {"message": "ok"}
    token_member = r_member.cookies.get("atelier_token")
    assert token_member

    client.cookies.set("atelier_token", token_member)
    me_member = await client.get("/auth/me")
    assert me_member.status_code == 200
    member_id = me_member.json()["user"]["id"]

    # ACT / ASSERT (c) — non-admin cannot call the endpoint
    forbidden = await client.put(
        f"/admin/users/{member_id}/admin-status",
        json={"is_tool_admin": True},
    )
    assert forbidden.status_code == 403
    assert forbidden.json()["code"] == "FORBIDDEN"

    # ACT / ASSERT (a) — tool admin promotes a regular user
    client.cookies.set("atelier_token", token_admin)
    promote = await client.put(
        f"/admin/users/{member_id}/admin-status",
        json={"is_tool_admin": True},
    )
    assert promote.status_code == 200
    data = promote.json()
    assert data["is_tool_admin"] is True

    client.cookies.set("atelier_token", token_member)
    me_after = await client.get("/auth/me")
    assert me_after.json()["user"]["is_tool_admin"] is True

    # ACT / ASSERT (b) — new tool admin cannot self-revoke
    self_revoke = await client.put(
        f"/admin/users/{member_id}/admin-status",
        json={"is_tool_admin": False},
    )
    assert self_revoke.status_code == 400
    assert self_revoke.json()["code"] == "SELF_REVOCATION_BLOCKED"
