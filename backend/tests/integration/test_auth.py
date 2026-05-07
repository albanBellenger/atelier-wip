"""Integration tests for authentication and tool-admin RBAC."""

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import LlmProviderRegistry


@pytest_asyncio.fixture(autouse=True)
async def _empty_user_table_for_bootstrap(db_session: AsyncSession) -> None:
    """First registered user becomes platform admin only when ``users`` is empty.

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
    """Full slice-1 auth flow: bootstrap platform admin, second user denied admin routes, bad login 401."""
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
    assert me_admin.json()["user"]["is_platform_admin"] is True

    client.cookies.set("atelier_token", token_member)
    me_member = await client.get("/auth/me")
    assert me_member.json()["user"]["is_platform_admin"] is False

    client.cookies.set("atelier_token", token_admin)
    cfg = await client.get("/admin/config")
    assert cfg.status_code == 404
    assert cfg.json()["code"] == "NOT_FOUND"

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
async def test_admin_put_llm_provider_api_key_encrypted_at_rest(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Fernet at rest for registry LLM key; row stores ciphertext, not raw secret."""
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
    pk = f"o{sfx}"[:64]
    put = await client.put(
        f"/admin/llm/providers/{pk}",
        json={
            "display_name": "OpenAI",
            "models": ["gpt-4o-mini"],
            "status": "connected",
            "is_default": True,
            "sort_order": 0,
            "llm_api_key": secret,
        },
    )
    assert put.status_code == 200, put.text
    out = put.json()
    assert out["llm_api_key_set"] is True
    assert out["llm_api_key_hint"] == "…abcd"
    row = (
        await db_session.execute(
            select(LlmProviderRegistry).where(LlmProviderRegistry.provider_key == pk)
        )
    ).scalar_one()
    assert row is not None
    assert row.api_key is not None
    assert not str(row.api_key).startswith("sk-")


@pytest.mark.asyncio
async def test_removed_admin_user_provisioning_and_token_usage_routes_return_404(
    client: AsyncClient,
) -> None:
    """User provisioning and platform token usage were removed; endpoints are gone (404)."""
    sfx = uuid.uuid4().hex[:8]
    email = f"pa-404-{sfx}@example.com"
    reg = await client.post(
        "/auth/register",
        json={
            "email": email,
            "password": "securepass123",
            "display_name": "Platform Admin",
        },
    )
    assert reg.status_code == 200
    client.cookies.set("atelier_token", reg.cookies.get("atelier_token"))
    assert (await client.get("/admin/users")).status_code == 404
    create = await client.post(
        "/admin/users",
        json={
            "email": f"new-{sfx}@example.com",
            "password": "securepass123",
            "display_name": "New",
        },
    )
    assert create.status_code == 404
    me = await client.get("/auth/me")
    assert me.status_code == 200
    uid = me.json()["user"]["id"]
    put = await client.put(
        f"/admin/users/{uid}/admin-status",
        json={"is_platform_admin": False},
    )
    assert put.status_code == 404
    assert (await client.get("/admin/token-usage")).status_code == 404
