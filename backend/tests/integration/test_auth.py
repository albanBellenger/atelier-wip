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
    token_admin = r1.json()["access_token"]

    r2 = await client.post(
        "/auth/register",
        json={
            "email": email_member,
            "password": "securepass123",
            "display_name": "Member",
        },
    )
    assert r2.status_code == 200
    token_member = r2.json()["access_token"]

    me_admin = await client.get(
        "/auth/me", headers={"Authorization": f"Bearer {token_admin}"}
    )
    assert me_admin.json()["user"]["is_tool_admin"] is True

    me_member = await client.get(
        "/auth/me", headers={"Authorization": f"Bearer {token_member}"}
    )
    assert me_member.json()["user"]["is_tool_admin"] is False

    cfg = await client.get(
        "/admin/config", headers={"Authorization": f"Bearer {token_admin}"}
    )
    assert cfg.status_code == 200
    assert cfg.json()["llm_api_key_set"] is False

    forbidden = await client.get(
        "/admin/config", headers={"Authorization": f"Bearer {token_member}"}
    )
    assert forbidden.status_code == 403
    assert forbidden.json()["code"] == "FORBIDDEN"

    bad = await client.post(
        "/auth/login",
        json={"email": "nobody@example.com", "password": "wrongpass1"},
    )
    assert bad.status_code == 401
    assert bad.json()["code"] == "INVALID_CREDENTIALS"
