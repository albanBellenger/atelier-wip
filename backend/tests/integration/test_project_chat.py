"""Slice 10: project chat REST + WebSocket."""

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
async def test_chat_history_requires_editor(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _sid, _sw, pid, _a, _b = await _studio_project_with_sections(
        client, sfx
    )
    del token
    outsider = await client.post(
        "/auth/register",
        json={
            "email": f"out-{sfx}@example.com",
            "password": "securepass123",
            "display_name": "out",
        },
    )
    assert outsider.status_code == 200
    client.cookies.set("atelier_token", outsider.cookies.get("atelier_token"))
    r = await client.get(f"/projects/{pid}/chat")
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_chat_history_empty(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _sid, _sw, pid, _a, _b = await _studio_project_with_sections(
        client, sfx
    )
    client.cookies.set("atelier_token", token)
    r = await client.get(f"/projects/{pid}/chat")
    assert r.status_code == 200
    body = r.json()
    assert body["messages"] == []
    assert body["next_before"] is None


@pytest.mark.asyncio
async def test_project_chat_websocket_persists_messages() -> None:
    sfx = uuid.uuid4().hex[:8]

    async def fake_stream(self, **kwargs):
        yield "Hello"
        yield " world"

    # TestClient runs the ASGI app on a worker thread with its own event loop. Other
    # integration tests use httpx.AsyncClient on pytest's loop; background tasks
    # (embedding/drift) use the global engine on that same loop. asyncpg connections
    # are loop-bound — reusing the shared pool across both loops causes
    # "Future ... attached to a different loop". Reset the pool around TestClient.
    await engine.dispose()

    try:
        with TestClient(app) as tc:
            tc.post(
                "/auth/register",
                json={
                    "email": f"ws-{sfx}@example.com",
                    "password": "securepass123",
                    "display_name": "wsuser",
                },
            )
            tok = tc.cookies.get("atelier_token")
            assert tok
            cr = tc.post("/studios", json={"name": f"Ws{sfx}", "description": "d"})
            assert cr.status_code == 200
            studio_id = cr.json()["id"]
            sw = tc.post(
                f"/studios/{studio_id}/software",
                json={"name": "SW", "description": None},
            )
            assert sw.status_code == 200
            software_id = sw.json()["id"]
            pr = tc.post(
                f"/software/{software_id}/projects",
                json={"name": "Pchat", "description": None},
            )
            assert pr.status_code == 200
            local_pid = pr.json()["id"]

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
                    f"/ws/projects/{local_pid}/chat?token={tok}"
                ) as ws:
                    ws.send_json({"type": "user_message", "content": "Say hi"})
                    seen_done = False
                    for _ in range(50):
                        raw = ws.receive_text()
                        msg = json.loads(raw)
                        if msg.get("type") == "error":
                            pytest.fail(f"websocket error: {msg}")
                        if msg.get("type") == "assistant_done":
                            seen_done = True
                            assert "Hello world" in (msg.get("content") or "")
                            break
                    assert seen_done

            hist = tc.get(f"/projects/{local_pid}/chat")
            assert hist.status_code == 200
            messages = hist.json()["messages"]
            roles = [m["role"] for m in messages]
            assert "user" in roles and roles.count("assistant") >= 1
    finally:
        await engine.dispose()
