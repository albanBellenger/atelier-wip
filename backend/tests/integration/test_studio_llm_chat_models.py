"""GET /studios/{id}/llm-chat-models for builder UI."""

import json
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    AdminConfig,
    LlmProviderRegistry,
    LlmRoutingRule,
    StudioLlmProviderPolicy,
)


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
async def test_studio_llm_chat_models_member_ok_outsider_403(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token_owner = await _register(client, sfx, "llmown")
    token_member = await _register(client, sfx, "llmmem")
    token_out = await _register(client, sfx, "llmout")

    client.cookies.set("atelier_token", token_owner)
    cr = await client.post(
        "/studios",
        json={"name": f"LlmStudio{sfx}", "description": ""},
    )
    assert cr.status_code == 200
    studio_id = cr.json()["id"]
    sid = uuid.UUID(studio_id)

    await client.post(
        f"/studios/{studio_id}/members",
        json={"email": f"llmmem-{sfx}@example.com", "role": "studio_member"},
    )

    cfg = await db_session.get(AdminConfig, 1)
    if cfg is None:
        db_session.add(
            AdminConfig(
                id=1,
                llm_provider="openai",
                llm_model="gpt-4o-mini",
                llm_api_key="sk-test",
            )
        )
    else:
        cfg.llm_model = "gpt-4o-mini"
        cfg.llm_api_key = cfg.llm_api_key or "sk-test"
    prov_key = f"prov_{sfx}"
    db_session.add(
        LlmProviderRegistry(
            id=uuid.uuid4(),
            provider_key=prov_key,
            display_name="Test LLM",
            models_json=json.dumps(["gpt-4o-mini", "gpt-4o"]),
            status="connected",
            is_default=True,
            sort_order=0,
        )
    )
    db_session.add(
        LlmRoutingRule(
            use_case="chat",
            primary_model="gpt-4o-mini",
            fallback_model=None,
        )
    )
    db_session.add(
        StudioLlmProviderPolicy(
            studio_id=sid,
            provider_key=prov_key,
            enabled=True,
            selected_model="gpt-4o-mini",
        )
    )
    await db_session.flush()

    client.cookies.set("atelier_token", token_out)
    denied = await client.get(f"/studios/{studio_id}/llm-chat-models")
    assert denied.status_code == 403

    client.cookies.set("atelier_token", token_member)
    ok = await client.get(f"/studios/{studio_id}/llm-chat-models")
    assert ok.status_code == 200, ok.text
    body = ok.json()
    assert body["effective_model"] == "gpt-4o-mini"
    assert body["allowed_models"] == ["gpt-4o-mini"]
    assert body["workspace_default_model"] == "gpt-4o-mini"
