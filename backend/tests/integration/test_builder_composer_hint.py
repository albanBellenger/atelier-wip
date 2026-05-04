"""POST /me/builder-composer-hint."""

import uuid
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from tests.integration.test_work_orders import _studio_project_with_sections


@pytest.mark.asyncio
async def test_builder_composer_hint_ok(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _sid, sw_id, pid, _a, _b = await _studio_project_with_sections(
        client, sfx
    )
    client.cookies.set("atelier_token", token)
    fake = {
        "headline": "Good morning — ready to shape SW.",
        "input_placeholder": "What should we refine first?",
    }
    with patch(
        "app.services.builder_composer_service.LLMService.chat_structured",
        new_callable=AsyncMock,
        return_value=fake,
    ):
        r = await client.post(
            "/me/builder-composer-hint",
            json={
                "software_id": sw_id,
                "project_id": pid,
                "local_hour": 9,
            },
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["headline"] == fake["headline"]
    assert body["input_placeholder"] == fake["input_placeholder"]


@pytest.mark.asyncio
async def test_builder_composer_hint_project_not_under_software(
    client: AsyncClient,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token_a, _sid_a, sw_a, _pid_a, _a, _b = await _studio_project_with_sections(
        client, sfx + "a"
    )
    _token_b, _sid_b, sw_b, pid_b, _a2, _b2 = await _studio_project_with_sections(
        client, sfx + "b"
    )
    client.cookies.set("atelier_token", token_a)
    fake = {"headline": "x", "input_placeholder": "y"}
    with patch(
        "app.services.builder_composer_service.LLMService.chat_structured",
        new_callable=AsyncMock,
        return_value=fake,
    ):
        r = await client.post(
            "/me/builder-composer-hint",
            json={"software_id": sw_a, "project_id": pid_b},
        )
    assert r.status_code == 404
    assert "not found" in r.json().get("detail", "").lower()
