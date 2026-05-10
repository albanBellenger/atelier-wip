"""Embedding first-time configuration backfills existing sections."""

import uuid

import pytest
from tests.integration.studio_http_seed import post_admin_studio
from httpx import AsyncClient
from sqlalchemy import update

from app.models import LlmProviderRegistry


async def _register(client: AsyncClient, suffix: str, label: str) -> str:
    r = await client.post(
        "/auth/register",
        json={
            "email": f"{label}-{suffix}@example.com",
            "password": "securepass123",
            "display_name": label,
        },
    )
    assert r.status_code == 200, r.text
    token = r.cookies.get("atelier_token")
    assert token
    return token


@pytest.mark.asyncio
async def test_admin_put_llm_routing_schedules_existing_sections_when_embedding_resolvable(
    client: AsyncClient,
    db_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    scheduled: list[str] = []

    def capture(sid: uuid.UUID) -> None:
        scheduled.append(str(sid))

    monkeypatch.setattr(
        "app.services.embedding_pipeline.schedule_section_embedding",
        capture,
    )

    sfx = uuid.uuid4().hex[:8]
    token = await _register(client, sfx, "owner")
    client.cookies.set("atelier_token", token)
    st = (await post_admin_studio(client, db_session, user_email=f"owner-{sfx}@example.com", json_body={"name": f"S{sfx}"})).json()
    studio_id = st["id"]
    sw = (
        await client.post(
            f"/studios/{studio_id}/software",
            json={"name": "SW"},
        )
    ).json()
    software_id = sw["id"]
    pr = (
        await client.post(
            f"/software/{software_id}/projects",
            json={"name": "P1"},
        )
    ).json()
    project_id = pr["id"]
    sec = (
        await client.post(
            f"/projects/{project_id}/sections",
            json={"title": "Body", "slug": None},
        )
    ).json()
    section_id = sec["id"]
    patch = await client.patch(
        f"/projects/{project_id}/sections/{section_id}",
        json={"content": "Some non-empty body for embedding."},
    )
    assert patch.status_code == 200, patch.text

    from sqlalchemy import select

    from app.models import User

    r = await db_session.execute(
        select(User).where(User.email == f"owner-{sfx}@example.com")
    )
    u = r.scalar_one()
    u.is_platform_admin = True
    await db_session.flush()

    client.cookies.set("atelier_token", token)
    prov = await client.put(
        "/admin/llm/providers/openai",
        json={
            "models": ["gpt-4o-mini", "text-embedding-3-small"],
            "api_base_url": None,
            "is_default": True,
            "sort_order": 0,
            "llm_api_key": "sk-test",
            "litellm_provider_slug": "openai",
        },
    )
    assert prov.status_code == 200, prov.text
    await db_session.execute(
        update(LlmProviderRegistry)
        .where(LlmProviderRegistry.provider_id == "openai")
        .values(status="connected")
    )
    await db_session.flush()

    rt = await client.put(
        "/admin/llm/routing",
        json={
            "rules": [
                {
                    "use_case": "chat",
                    "primary_model": "gpt-4o-mini",
                    "fallback_model": None,
                },
                {
                    "use_case": "code_gen",
                    "primary_model": "gpt-4o-mini",
                    "fallback_model": None,
                },
                {
                    "use_case": "classification",
                    "primary_model": "gpt-4o-mini",
                    "fallback_model": None,
                },
                {
                    "use_case": "embeddings",
                    "primary_model": "text-embedding-3-small",
                    "fallback_model": None,
                },
            ]
        },
    )
    assert rt.status_code == 200, rt.text
    assert section_id in scheduled
