"""Admin console wiring: overview, activity, RBAC."""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.admin_activity_service import AdminActivityService


@pytest.mark.asyncio
async def test_admin_users_directory_forbidden_for_member(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    admin_email = f"ac-admin-{sfx}@example.com"
    member_email = f"ac-mem-{sfx}@example.com"
    await client.post(
        "/auth/register",
        json={
            "email": admin_email,
            "password": "securepass123",
            "display_name": "TA",
        },
    )
    await client.post(
        "/auth/register",
        json={
            "email": member_email,
            "password": "securepass123",
            "display_name": "Mem",
        },
    )
    r_login = await client.post(
        "/auth/login",
        json={"email": member_email, "password": "securepass123"},
    )
    assert r_login.status_code == 200
    tok = r_login.cookies.get("atelier_token")
    assert tok
    client.cookies.set("atelier_token", tok)
    denied = await client.get("/admin/users")
    assert denied.status_code == 403


@pytest.mark.asyncio
async def test_admin_overview_and_activity_ok(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    admin_email = f"ac2-admin-{sfx}@example.com"
    r = await client.post(
        "/auth/register",
        json={
            "email": admin_email,
            "password": "securepass123",
            "display_name": "TA",
        },
    )
    assert r.status_code == 200
    from sqlalchemy import update

    from app.models import User

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

    await AdminActivityService(db_session).record(
        action="test.seed",
        actor_user_id=None,
        summary="integration seed",
    )
    await db_session.flush()

    ov = await client.get("/admin/console/overview")
    assert ov.status_code == 200
    body = ov.json()
    assert "studios" in body
    if body["studios"]:
        assert "created_at" in body["studios"][0]
        assert "description" in body["studios"][0]
    assert "mtd_spend_total_usd" in body
    assert "recent_activity" in body
    assert len(body["recent_activity"]) >= 1

    users = await client.get("/admin/users")
    assert users.status_code == 200
    urows = users.json()
    assert isinstance(urows, list)
    assert len(urows) >= 1
    assert "created_at" in urows[0]
    assert "studio_memberships" in urows[0]


@pytest.mark.asyncio
async def test_admin_put_llm_provider_optional_api_base_url(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    admin_email = f"llmprov-{sfx}@example.com"
    r = await client.post(
        "/auth/register",
        json={
            "email": admin_email,
            "password": "securepass123",
            "display_name": "TA",
        },
    )
    assert r.status_code == 200
    from sqlalchemy import update

    from app.models import User

    await db_session.execute(
        update(User).where(User.email == admin_email.lower()).values(is_tool_admin=True)
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

    put = await client.put(
        "/admin/llm/providers/custom_eu",
        json={
            "display_name": "Custom EU",
            "models": ["gpt-4o-mini"],
            "api_base_url": "https://eu.example.com/v1",
            "status": "connected",
        },
    )
    assert put.status_code == 200
    body = put.json()
    assert body["provider_key"] == "custom_eu"
    assert body["api_base_url"] == "https://eu.example.com/v1"
    assert body.get("logo_url") is not None
    assert "eu.example.com" in body["logo_url"]

    listed = await client.get("/admin/llm/providers")
    assert listed.status_code == 200
    rows = listed.json()
    match = next((x for x in rows if x["provider_key"] == "custom_eu"), None)
    assert match is not None
    assert match["api_base_url"] == "https://eu.example.com/v1"
    assert match.get("logo_url") is not None


@pytest.mark.asyncio
async def test_admin_put_llm_routing_tool_admin_ok(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    admin_email = f"rt-admin-{sfx}@example.com"
    r = await client.post(
        "/auth/register",
        json={
            "email": admin_email,
            "password": "securepass123",
            "display_name": "TA",
        },
    )
    assert r.status_code == 200
    from sqlalchemy import update

    from app.models import User

    await db_session.execute(
        update(User).where(User.email == admin_email.lower()).values(is_tool_admin=True)
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

    put = await client.put(
        "/admin/llm/routing",
        json={
            "rules": [
                {
                    "use_case": "chat",
                    "primary_model": "gpt-4o-mini",
                    "fallback_model": "gpt-4o",
                },
                {
                    "use_case": "code_gen",
                    "primary_model": "gpt-4o",
                    "fallback_model": None,
                },
            ]
        },
    )
    assert put.status_code == 200
    body = put.json()
    assert isinstance(body, list)
    assert len(body) == 2
    by_uc = {x["use_case"]: x for x in body}
    assert by_uc["chat"]["primary_model"] == "gpt-4o-mini"
    assert by_uc["chat"]["fallback_model"] == "gpt-4o"
    assert by_uc["code_gen"]["primary_model"] == "gpt-4o"
    assert by_uc["code_gen"]["fallback_model"] is None

    listed = await client.get("/admin/llm/routing")
    assert listed.status_code == 200
    rows = listed.json()
    assert len(rows) == 2


@pytest.mark.asyncio
async def test_admin_put_llm_routing_forbidden_for_member(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    admin_email = f"rt2-admin-{sfx}@example.com"
    member_email = f"rt2-mem-{sfx}@example.com"
    await client.post(
        "/auth/register",
        json={
            "email": admin_email,
            "password": "securepass123",
            "display_name": "TA",
        },
    )
    await client.post(
        "/auth/register",
        json={
            "email": member_email,
            "password": "securepass123",
            "display_name": "Mem",
        },
    )
    r_login = await client.post(
        "/auth/login",
        json={"email": member_email, "password": "securepass123"},
    )
    assert r_login.status_code == 200
    tok = r_login.cookies.get("atelier_token")
    assert tok
    client.cookies.set("atelier_token", tok)
    denied = await client.put(
        "/admin/llm/routing",
        json={
            "rules": [
                {"use_case": "chat", "primary_model": "gpt-4o-mini", "fallback_model": None},
            ]
        },
    )
    assert denied.status_code == 403


@pytest.mark.asyncio
async def test_admin_llm_routing_get_unauthenticated_401(client: AsyncClient) -> None:
    client.cookies.clear()
    r = await client.get("/admin/llm/routing")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_admin_llm_deployment_forbidden_for_member(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    admin_email = f"dep-admin-{sfx}@example.com"
    member_email = f"dep-mem-{sfx}@example.com"
    await client.post(
        "/auth/register",
        json={
            "email": admin_email,
            "password": "securepass123",
            "display_name": "TA",
        },
    )
    await client.post(
        "/auth/register",
        json={
            "email": member_email,
            "password": "securepass123",
            "display_name": "Mem",
        },
    )
    r_login = await client.post(
        "/auth/login",
        json={"email": member_email, "password": "securepass123"},
    )
    assert r_login.status_code == 200
    tok = r_login.cookies.get("atelier_token")
    assert tok
    client.cookies.set("atelier_token", tok)
    denied = await client.get("/admin/llm/deployment")
    assert denied.status_code == 403


@pytest.mark.asyncio
async def test_admin_llm_deployment_ok(client: AsyncClient, db_session: AsyncSession) -> None:
    sfx = uuid.uuid4().hex[:8]
    admin_email = f"dep-ok-{sfx}@example.com"
    await client.post(
        "/auth/register",
        json={
            "email": admin_email,
            "password": "securepass123",
            "display_name": "TA",
        },
    )
    from sqlalchemy import update

    from app.models import User

    await db_session.execute(
        update(User).where(User.email == admin_email.lower()).values(is_tool_admin=True)
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

    r = await client.get("/admin/llm/deployment")
    assert r.status_code == 200
    payload = r.json()
    assert "credentials" in payload
    assert "providers" in payload
    assert isinstance(payload["providers"], list)
    cred = payload["credentials"]
    assert "llm_provider" in cred
    assert "llm_model" in cred
    assert "llm_api_key_set" in cred


@pytest.mark.asyncio
async def test_admin_post_test_llm_forbidden_for_member(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    admin_email = f"tllm-admin-{sfx}@example.com"
    member_email = f"tllm-mem-{sfx}@example.com"
    await client.post(
        "/auth/register",
        json={
            "email": admin_email,
            "password": "securepass123",
            "display_name": "TA",
        },
    )
    await client.post(
        "/auth/register",
        json={
            "email": member_email,
            "password": "securepass123",
            "display_name": "Mem",
        },
    )
    r_login = await client.post(
        "/auth/login",
        json={"email": member_email, "password": "securepass123"},
    )
    assert r_login.status_code == 200
    tok = r_login.cookies.get("atelier_token")
    assert tok
    client.cookies.set("atelier_token", tok)
    denied = await client.post("/admin/test/llm", json={})
    assert denied.status_code == 403


@pytest.mark.asyncio
async def test_admin_post_test_llm_accepts_body(client: AsyncClient, db_session: AsyncSession) -> None:
    sfx = uuid.uuid4().hex[:8]
    admin_email = f"tllm-ok-{sfx}@example.com"
    await client.post(
        "/auth/register",
        json={
            "email": admin_email,
            "password": "securepass123",
            "display_name": "TA",
        },
    )
    from sqlalchemy import update

    from app.models import User

    await db_session.execute(
        update(User).where(User.email == admin_email.lower()).values(is_tool_admin=True)
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

    r0 = await client.post("/admin/test/llm", json={})
    assert r0.status_code == 200
    body0 = r0.json()
    assert "ok" in body0
    assert "message" in body0

    r1 = await client.post(
        "/admin/test/llm",
        json={"model": "some-model-id", "api_base_url": "https://custom.example.com/v1"},
    )
    assert r1.status_code == 200
    body1 = r1.json()
    assert "ok" in body1
    assert "message" in body1


@pytest.mark.asyncio
async def test_admin_patch_studio_budget_overage_action(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    admin_email = f"bov-{sfx}@example.com"
    await client.post(
        "/auth/register",
        json={
            "email": admin_email,
            "password": "securepass123",
            "display_name": "TA",
        },
    )
    from sqlalchemy import update

    from app.models import User

    await db_session.execute(
        update(User).where(User.email == admin_email.lower()).values(is_tool_admin=True)
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

    cr = await client.post("/studios", json={"name": f"Bov{sfx}", "description": "d"})
    assert cr.status_code == 200
    studio_id = cr.json()["id"]

    ov = await client.get("/admin/console/overview")
    assert ov.status_code == 200
    row = next(r for r in ov.json()["studios"] if r["studio_id"] == studio_id)
    assert row["budget_overage_action"] == "pause_generations"

    patch = await client.patch(
        f"/admin/studios/{studio_id}/budget",
        json={"budget_overage_action": "allow_with_warning"},
    )
    assert patch.status_code == 204

    ov2 = await client.get("/admin/console/overview")
    row2 = next(r for r in ov2.json()["studios"] if r["studio_id"] == studio_id)
    assert row2["budget_overage_action"] == "allow_with_warning"
