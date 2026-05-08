"""Software chat REST + WebSocket."""

import json
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from httpx import AsyncClient

from app.database import engine
from app.exceptions import ApiError
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

    async def fake_agent_stream(
        self,
        *,
        software_id,
        user_id,
        preferred_model=None,
        chat_messages=None,
        debug_prompt_payload=None,
    ):
        from app.models import Software
        from app.schemas.token_usage_scope import TokenUsageScope

        software = await self.db.get(Software, software_id)
        assert software is not None
        ctx = TokenUsageScope(
            studio_id=software.studio_id,
            software_id=software.id,
            project_id=None,
            user_id=user_id,
        )
        yield "Hi", ctx
        yield " team", ctx

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
                usage_scope: object,
                call_source: str,
                preferred_model: str | None = None,
                max_history_tokens: int = 12_000,
            ) -> tuple[list, bool]:
                return (list(messages), False)

            with (
                patch(
                    "app.agents.software_chat_agent.SoftwareChatAgent.stream_assistant_tokens",
                    fake_agent_stream,
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
                            assert "llm_outbound_messages" not in msg
                            break
                    assert seen_done

            hist = tc.get(f"/software/{software_id}/chat")
            assert hist.status_code == 200
            messages = hist.json()["messages"]
            roles = [m["role"] for m in messages]
            assert "user" in roles and roles.count("assistant") >= 1
            user_rows = [m for m in messages if m["role"] == "user"]
            assert user_rows
            assert user_rows[0].get("user_display_name") == "wsuser"
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_software_chat_websocket_assistant_done_includes_llm_outbound_when_log_prompts() -> None:
    sfx = uuid.uuid4().hex[:8]

    async def fake_agent_stream_log(
        self,
        *,
        software_id,
        user_id,
        preferred_model=None,
        chat_messages=None,
        debug_prompt_payload=None,
    ):
        from app.config import get_settings
        from app.models import Software
        from app.schemas.token_usage_scope import TokenUsageScope
        from app.services.llm_service import serialize_outbound_chat_messages_for_debug

        software = await self.db.get(Software, software_id)
        assert software is not None
        ctx = TokenUsageScope(
            studio_id=software.studio_id,
            software_id=software.id,
            project_id=None,
            user_id=user_id,
        )
        yield "Hi", ctx
        yield " team", ctx
        if debug_prompt_payload is not None and get_settings().log_llm_prompts:
            openai_msgs = chat_messages or []
            full_messages: list = [
                {"role": "system", "content": "sys"},
                *[dict(m) for m in openai_msgs],
            ]
            debug_prompt_payload["llm_outbound_messages"] = (
                serialize_outbound_chat_messages_for_debug(
                    full_messages, model="openai/gpt-4o-mini"
                )
            )

    await engine.dispose()

    try:
        with TestClient(app) as tc:
            tc.post(
                "/auth/register",
                json={
                    "email": f"sw-ws-log-{sfx}@example.com",
                    "password": "securepass123",
                    "display_name": "wsuser",
                },
            )
            tok = tc.cookies.get("atelier_token")
            assert tok
            cr = tc.post("/studios", json={"name": f"SwLog{sfx}", "description": "d"})
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
                usage_scope: object,
                call_source: str,
                preferred_model: str | None = None,
                max_history_tokens: int = 12_000,
            ) -> tuple[list, bool]:
                return (list(messages), False)

            def _log_prompts_on() -> MagicMock:
                m = MagicMock()
                m.log_llm_prompts = True
                return m

            with (
                patch(
                    "app.agents.software_chat_agent.SoftwareChatAgent.stream_assistant_tokens",
                    fake_agent_stream_log,
                ),
                patch(
                    "app.services.llm_service.LLMService.ensure_openai_llm_ready",
                    new_callable=AsyncMock,
                ),
                patch(
                    "app.services.llm_service.LLMService.trim_chat_messages_for_stream",
                    _trim_skip_llm_config,
                ),
                patch(
                    "app.routers.software_chat.get_settings",
                    _log_prompts_on,
                ),
                patch(
                    "app.agents.software_chat_agent.get_settings",
                    _log_prompts_on,
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
                            outbound = msg.get("llm_outbound_messages")
                            assert isinstance(outbound, list)
                            roles = [m.get("role") for m in outbound]
                            assert "system" in roles
                            assert "user" in roles
                            for row in outbound:
                                assert "tokens" in row
                                assert isinstance(row["tokens"], int)
                            break
                    assert seen_done
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_software_chat_ws_stream_failure_emits_error_no_assistant_row() -> None:
    """Mid-stream ApiError yields structured error frame; no assistant_done or DB assistant."""
    sfx = uuid.uuid4().hex[:8]

    async def fake_agent_stream_fail(
        self,
        *,
        software_id,
        user_id,
        preferred_model=None,
        chat_messages=None,
        debug_prompt_payload=None,
    ):
        from app.models import Software
        from app.schemas.token_usage_scope import TokenUsageScope

        software = await self.db.get(Software, software_id)
        assert software is not None
        ctx = TokenUsageScope(
            studio_id=software.studio_id,
            software_id=software.id,
            project_id=None,
            user_id=user_id,
        )
        yield "partial", ctx
        raise ApiError(
            status_code=502,
            code="LLM_UPSTREAM_TEST_SW",
            message="Simulated upstream failure (software).",
        )

    await engine.dispose()

    try:
        with TestClient(app) as tc:
            tc.post(
                "/auth/register",
                json={
                    "email": f"sw-fail-{sfx}@example.com",
                    "password": "securepass123",
                    "display_name": "wsuser",
                },
            )
            tok = tc.cookies.get("atelier_token")
            assert tok
            cr = tc.post("/studios", json={"name": f"SwFail{sfx}", "description": "d"})
            assert cr.status_code == 200
            studio_id = cr.json()["id"]
            sw = tc.post(
                f"/studios/{studio_id}/software",
                json={"name": "SWSFAIL", "description": None},
            )
            assert sw.status_code == 200
            software_id = sw.json()["id"]

            async def _trim_skip_llm_config(
                self: object,
                messages: list,
                *,
                usage_scope: object,
                call_source: str,
                preferred_model: str | None = None,
                max_history_tokens: int = 12_000,
            ) -> tuple[list, bool]:
                return (list(messages), False)

            with (
                patch(
                    "app.agents.software_chat_agent.SoftwareChatAgent.stream_assistant_tokens",
                    fake_agent_stream_fail,
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
                    ws.send_json({"type": "user_message", "content": "Trigger fail"})
                    saw_token = False
                    saw_error = False
                    saw_done = False
                    for _ in range(50):
                        raw = ws.receive_text()
                        msg = json.loads(raw)
                        if msg.get("type") == "assistant_token":
                            if (msg.get("text") or "") == "partial":
                                saw_token = True
                        if msg.get("type") == "error":
                            saw_error = True
                            assert msg.get("code") == "LLM_UPSTREAM_TEST_SW"
                            assert "Simulated" in (msg.get("message") or "")
                            break
                        if msg.get("type") == "assistant_done":
                            saw_done = True
                    assert saw_token and saw_error and not saw_done

            hist = tc.get(f"/software/{software_id}/chat")
            assert hist.status_code == 200
            messages = hist.json()["messages"]
            roles = [m["role"] for m in messages]
            assert roles.count("user") == 1
            assert roles.count("assistant") == 0
    finally:
        await engine.dispose()
