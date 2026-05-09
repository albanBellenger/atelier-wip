"""Integration tests for GET /auth/llm-runtime (read-only LLM display for authenticated users)."""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


@pytest.mark.asyncio
async def test_llm_runtime_unauthorized(client: AsyncClient) -> None:
    r = await client.get("/auth/llm-runtime")
    assert r.status_code == 401
    assert r.json()["code"] == "UNAUTHORIZED"


@pytest.mark.asyncio
async def test_llm_runtime_ok_for_authenticated_user(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    reg = await client.post(
        "/auth/register",
        json={
            "email": f"llmrt-{sfx}@example.com",
            "password": "securepass123",
            "display_name": "Member",
        },
    )
    assert reg.status_code == 200
    client.cookies.set("atelier_token", reg.cookies.get("atelier_token"))

    rid = uuid.uuid4()
    pk = f"rt{sfx}"[:32]
    await db_session.execute(text("UPDATE llm_provider_registry SET is_default = false"))
    await db_session.execute(
        text(
            """
            INSERT INTO llm_provider_registry (
                id, provider_id, models_json, status, is_default, sort_order
            ) VALUES (
                CAST(:id AS uuid), :pk, :models_json, 'connected', true, 0
            )
            """
        ),
        {"id": str(rid), "pk": pk, "models_json": '["gpt-4o-mini"]'},
    )
    await db_session.flush()

    r = await client.get("/auth/llm-runtime")
    assert r.status_code == 200
    body = r.json()
    assert body["llm_provider"] == pk
    assert body["llm_model"] == "gpt-4o-mini"
