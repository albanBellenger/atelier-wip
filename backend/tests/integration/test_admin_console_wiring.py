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
    assert denied.status_code == 404


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
        assert "budget_status" in body["studios"][0]
        bs = body["studios"][0]["budget_status"]
        assert "severity" in bs
        assert "is_capped" in bs
    assert "recent_activity" in body
    assert len(body["recent_activity"]) >= 1

    users = await client.get("/admin/users")
    assert users.status_code == 404


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
        update(User).where(User.email == admin_email.lower()).values(is_platform_admin=True)
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
            "litellm_provider_slug": "openai",
        },
    )
    assert put.status_code == 200
    body = put.json()
    assert body["provider_key"] == "custom_eu"
    assert body["litellm_provider_slug"] == "openai"
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
        update(User).where(User.email == admin_email.lower()).values(is_platform_admin=True)
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
        update(User).where(User.email == admin_email.lower()).values(is_platform_admin=True)
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
    assert "has_providers" in payload
    assert "providers" in payload
    assert isinstance(payload["providers"], list)
    assert isinstance(payload["has_providers"], bool)
    assert payload["has_providers"] == (len(payload["providers"]) > 0)


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
        update(User).where(User.email == admin_email.lower()).values(is_platform_admin=True)
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

    r2 = await client.post(
        "/admin/test/llm",
        json={"provider_key": "any", "model": "m1"},
    )
    assert r2.status_code == 200
    body2 = r2.json()
    assert "ok" in body2


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
        update(User).where(User.email == admin_email.lower()).values(is_platform_admin=True)
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
        f"/studios/{studio_id}/budget",
        json={"budget_overage_action": "allow_with_warning"},
    )
    assert patch.status_code == 204

    ov2 = await client.get("/admin/console/overview")
    row2 = next(r for r in ov2.json()["studios"] if r["studio_id"] == studio_id)
    assert row2["budget_overage_action"] == "allow_with_warning"


@pytest.mark.asyncio
async def test_admin_llm_model_suggestions_unauthenticated_401(client: AsyncClient) -> None:
    client.cookies.clear()
    r = await client.get("/admin/llm/model-suggestions")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_admin_llm_model_suggestions_member_forbidden(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    email = f"sugm-{sfx}@example.com"
    await client.post(
        "/auth/register",
        json={
            "email": email,
            "password": "securepass123",
            "display_name": "Mem",
        },
    )
    r_login = await client.post(
        "/auth/login",
        json={"email": email, "password": "securepass123"},
    )
    assert r_login.status_code == 200
    client.cookies.set("atelier_token", r_login.cookies.get("atelier_token"))
    denied = await client.get("/admin/llm/model-suggestions", params={"source": "catalog"})
    assert denied.status_code == 403


@pytest.mark.asyncio
async def test_admin_llm_model_suggestions_catalog_mocked(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    admin_email = f"sugs-{sfx}@example.com"
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
        update(User).where(User.email == admin_email.lower()).values(is_platform_admin=True)
    )
    await db_session.flush()

    class FakeResp:
        status_code = 200

        def json(self) -> dict:
            return {
                "object": "list",
                "data": [
                    {"id": "moonshot/x1", "provider": "moonshot", "mode": "chat"},
                ],
            }

    class FakeClient:
        def __init__(self, *a: object, **k: object) -> None:
            pass

        async def __aenter__(self) -> "FakeClient":
            return self

        async def __aexit__(self, *a: object) -> None:
            return None

        async def get(self, *a: object, **k: object) -> FakeResp:
            return FakeResp()

    monkeypatch.setattr(
        "app.services.llm_model_suggestions_service.httpx.AsyncClient",
        lambda *a, **k: FakeClient(),
    )

    r_login = await client.post(
        "/auth/login",
        json={"email": admin_email, "password": "securepass123"},
    )
    assert r_login.status_code == 200
    client.cookies.set("atelier_token", r_login.cookies.get("atelier_token"))

    r = await client.get(
        "/admin/llm/model-suggestions",
        params={"source": "catalog", "litellm_provider": "moonshot"},
    )
    assert r.status_code == 200, r.text
    payload = r.json()
    assert payload["models"]
    assert payload["models"][0]["id"] == "moonshot/x1"
    assert payload["models"][0]["source"] == "catalog"


@pytest.mark.asyncio
async def test_admin_llm_model_suggestions_auto_catalog_when_upstream_404(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    admin_email = f"suga-{sfx}@example.com"
    await client.post(
        "/auth/register",
        json={
            "email": admin_email,
            "password": "securepass123",
            "display_name": "TA",
        },
    )
    from sqlalchemy import delete, update

    from app.models import LlmProviderRegistry, User
    from app.security.field_encryption import encode_admin_stored_secret

    await db_session.execute(
        update(User).where(User.email == admin_email.lower()).values(is_platform_admin=True)
    )
    await db_session.execute(delete(LlmProviderRegistry))
    db_session.add(
        LlmProviderRegistry(
            id=uuid.uuid4(),
            provider_key="openai",
            display_name="OpenAI",
            models_json='["gpt-4o-mini"]',
            api_base_url=None,
            logo_url=None,
            status="connected",
            is_default=True,
            sort_order=0,
            api_key=encode_admin_stored_secret("sk-test"),
            litellm_provider_slug="openai",
        )
    )
    await db_session.flush()

    class FakeResp:
        def __init__(self, code: int, body: dict) -> None:
            self.status_code = code
            self._body = body

        def json(self) -> dict:
            return self._body

    class FakeClient:
        def __init__(self, *a: object, **k: object) -> None:
            pass

        async def __aenter__(self) -> "FakeClient":
            return self

        async def __aexit__(self, *a: object) -> None:
            return None

        async def get(self, url: str, **kwargs: object) -> FakeResp:
            if "api.litellm.ai" in url:
                return FakeResp(
                    200,
                    {
                        "object": "list",
                        "data": [
                            {"id": "openai/z9", "provider": "openai", "mode": "chat"},
                        ],
                    },
                )
            return FakeResp(404, {})

    monkeypatch.setattr(
        "app.services.llm_model_suggestions_service.httpx.AsyncClient",
        lambda *a, **k: FakeClient(),
    )

    r_login = await client.post(
        "/auth/login",
        json={"email": admin_email, "password": "securepass123"},
    )
    assert r_login.status_code == 200
    client.cookies.set("atelier_token", r_login.cookies.get("atelier_token"))

    r = await client.get("/admin/llm/model-suggestions", params={"source": "auto"})
    assert r.status_code == 200, r.text
    payload = r.json()
    assert any(m["id"] == "openai/z9" for m in payload["models"])
