"""Integration tests for authentication and tool-admin RBAC."""

import uuid

import pytest
from httpx import AsyncClient


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
