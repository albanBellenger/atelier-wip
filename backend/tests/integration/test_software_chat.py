"""Software chat REST + WebSocket."""

import json
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from httpx import AsyncClient

from app.database import engine
from app.main import app
from tests.integration.test_work_orders import _studio_project_with_sections


@pytest.mark.asyncio
async def test_software_chat_history_requires_editor(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _sid, sw_id, pid, _a, _b = await _studio_project_with_sections(
        client, sfx
    )
    del pid, token
    outsider = await client.post(
        "/auth/register",
        json={
            "email": f"sw-out-{sfx}@example.com",
            "password": "securepass123",
            "display_name": "out",
        },
    )
    assert outsider.status_code == 200
    client.cookies.set("atelier_token", outsider.cookies.get("atelier_token"))
    r = await client.get(f"/software/{sw_id}/chat")
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_software_chat_history_empty(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _sid, sw_id, _pid, _a, _b = await _studio_project_with_sections(
        client, sfx
    )
    client.cookies.set("atelier_token", token)
    r = await client.get(f"/software/{sw_id}/chat")
    assert r.status_code == 200
    body = r.json()
    assert body["messages"] == []
    assert body["next_before"] is None


@pytest.mark.asyncio
async def test_software_chat_websocket_persists_messages() -> None:
    sfx = uuid.uuid4().hex[:8]

    async def fake_stream(self, **kwargs):
        yield "Hi"
        yield " team"

    await engine.dispose()

    try:
        with TestClient(app) as tc:
            tc.post(
                "/auth/register",
                json={
                    "email": f"sw-ws-{sfx}@example.com",
                    "password": "securepass123",
                    "display_name": "wsuser",
                },
            )
            tok = tc.cookies.get("atelier_token")
            assert tok
            cr = tc.post("/studios", json={"name": f"Sw{sfx}", "description": "d"})
            assert cr.status_code == 200
            studio_id = cr.json()["id"]
            sw = tc.post(
                f"/studios/{studio_id}/software",
                json={"name": "SWS", "description": None},
            )
            assert sw.status_code == 200
            software_id = sw.json()["id"]

            async def _trim_skip_llm_config(
                self: object,
                messages: list,
                *,
                context: object,
                call_type: str,
                preferred_model: str | None = None,
                max_history_tokens: int = 12_000,
            ) -> tuple[list, bool]:
                return (list(messages), False)

            with (
                patch(
                    "app.services.llm_service.LLMService.chat_stream",
                    fake_stream,
                ),
                patch(
                    "app.services.llm_service.LLMService.ensure_openai_llm_ready",
                    new_callable=AsyncMock,
                ),
                patch(
                    "app.services.llm_service.LLMService.trim_chat_messages_for_stream",
                    _trim_skip_llm_config,
                ),
            ):
                with tc.websocket_connect(
                    f"/ws/software/{software_id}/chat?token={tok}"
                ) as ws:
                    ws.send_json({"type": "user_message", "content": "Hello"})
                    seen_done = False
                    for _ in range(50):
                        raw = ws.receive_text()
                        msg = json.loads(raw)
                        if msg.get("type") == "error":
                            pytest.fail(f"websocket error: {msg}")
                        if msg.get("type") == "assistant_done":
                            seen_done = True
                            assert "Hi team" in (msg.get("content") or "")
                            break
                    assert seen_done

            hist = tc.get(f"/software/{software_id}/chat")
            assert hist.status_code == 200
            messages = hist.json()["messages"]
            roles = [m["role"] for m in messages]
            assert "user" in roles and roles.count("assistant") >= 1
    finally:
        await engine.dispose()
