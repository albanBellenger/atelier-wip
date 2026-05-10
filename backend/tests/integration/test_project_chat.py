"""Slice 10: project chat REST + WebSocket."""

import json
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from httpx import AsyncClient

from app.database import engine
from app.exceptions import ApiError
from app.main import app
from tests.integration.studio_http_seed import promote_platform_admin_sync
from tests.integration.test_work_orders import _studio_project_with_sections


@pytest.mark.asyncio
async def test_chat_history_requires_editor(
    client: AsyncClient, db_session
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _sid, _sw, pid, _a, _b = await _studio_project_with_sections(
        client, db_session, sfx
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
async def test_chat_history_empty(client: AsyncClient, db_session) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _sid, _sw, pid, _a, _b = await _studio_project_with_sections(
        client, db_session, sfx
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

    async def fake_agent_stream(
        self,
        *,
        project_id,
        usage_scope,
        chat_messages=None,
        preferred_model=None,
        rag_text: str = "",
        debug_prompt_payload=None,
    ):
        yield "Hello", usage_scope
        yield " world", usage_scope

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
            promote_platform_admin_sync(f"ws-{sfx}@example.com")
            cr = tc.post("/admin/studios", json={"name": f"Ws{sfx}", "description": "d"})
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
                usage_scope: object,
                call_source: str,
                preferred_model: str | None = None,
                max_history_tokens: int = 12_000,
            ) -> tuple[list, bool]:
                return (list(messages), False)

            with (
                patch(
                    "app.agents.project_chat_agent.ProjectChatAgent.stream_assistant_tokens",
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
                            assert "llm_outbound_messages" not in msg
                            break
                    assert seen_done

            hist = tc.get(f"/projects/{local_pid}/chat")
            assert hist.status_code == 200
            messages = hist.json()["messages"]
            roles = [m["role"] for m in messages]
            assert "user" in roles and roles.count("assistant") >= 1
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_project_chat_websocket_assistant_done_includes_llm_outbound_when_log_prompts() -> None:
    sfx = uuid.uuid4().hex[:8]

    async def fake_agent_stream_log(
        self,
        *,
        project_id,
        usage_scope,
        chat_messages=None,
        preferred_model=None,
        rag_text: str,
        debug_prompt_payload=None,
    ):
        from app.services.llm_service import serialize_outbound_chat_messages_for_debug

        yield "Hello", usage_scope
        yield " world", usage_scope
        if debug_prompt_payload is not None:
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
                    "email": f"ws-log-{sfx}@example.com",
                    "password": "securepass123",
                    "display_name": "wsuser",
                },
            )
            tok = tc.cookies.get("atelier_token")
            assert tok
            promote_platform_admin_sync(f"ws-log-{sfx}@example.com")
            cr = tc.post("/admin/studios", json={"name": f"WsLog{sfx}", "description": "d"})
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
                json={"name": "PchatLog", "description": None},
            )
            assert pr.status_code == 200
            local_pid = pr.json()["id"]

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
                    "app.agents.project_chat_agent.ProjectChatAgent.stream_assistant_tokens",
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
                    "app.routers.project_chat.get_settings",
                    _log_prompts_on,
                ),
                patch(
                    "app.agents.project_chat_agent.get_settings",
                    _log_prompts_on,
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
async def test_project_chat_ws_rejects_disallowed_preferred_model() -> None:
    """WS passes optional model into LLM readiness; invalid choice yields error frame."""
    sfx = uuid.uuid4().hex[:8]

    await engine.dispose()

    try:
        with TestClient(app) as tc:
            tc.post(
                "/auth/register",
                json={
                    "email": f"pc-ws-{sfx}@example.com",
                    "password": "securepass123",
                    "display_name": "wsuser",
                },
            )
            tok = tc.cookies.get("atelier_token")
            assert tok
            promote_platform_admin_sync(f"pc-ws-{sfx}@example.com")
            cr = tc.post("/admin/studios", json={"name": f"PcWs{sfx}", "description": "d"})
            assert cr.status_code == 200
            studio_id = cr.json()["id"]
            sw = tc.post(
                f"/studios/{studio_id}/software",
                json={"name": "SWS", "description": None},
            )
            assert sw.status_code == 200
            software_id = sw.json()["id"]
            pr = tc.post(
                f"/software/{software_id}/projects",
                json={"name": "Pchat2", "description": None},
            )
            assert pr.status_code == 200
            local_pid = pr.json()["id"]

            async def ensure_reject(self, *, usage_scope=None, call_source="chat", preferred_model=None):
                _ = (self, usage_scope, call_source)
                if preferred_model == "gpt-4o":
                    raise ApiError(
                        status_code=400,
                        code="CHAT_MODEL_NOT_ALLOWED",
                        message="Requested model is not allowed for chat in this studio.",
                    )

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
                    "app.services.llm_service.LLMService.ensure_openai_llm_ready",
                    ensure_reject,
                ),
                patch(
                    "app.services.llm_service.LLMService.trim_chat_messages_for_stream",
                    _trim_skip_llm_config,
                ),
            ):
                with tc.websocket_connect(
                    f"/ws/projects/{local_pid}/chat?token={tok}"
                ) as ws:
                    ws.send_json(
                        {
                            "type": "user_message",
                            "content": "Say hi",
                            "model": "gpt-4o",
                        }
                    )
                    saw_error = False
                    for _ in range(20):
                        raw = ws.receive_text()
                        msg = json.loads(raw)
                        if msg.get("type") == "error":
                            saw_error = True
                            assert "not allowed" in (msg.get("message") or "").lower()
                            break
                    assert saw_error
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_project_chat_ws_stream_failure_emits_error_no_assistant_row() -> None:
    """Mid-stream ApiError yields structured error frame; no assistant_done or DB assistant."""
    sfx = uuid.uuid4().hex[:8]

    async def fake_agent_stream_fail(
        self,
        *,
        project_id,
        usage_scope,
        chat_messages=None,
        preferred_model=None,
        rag_text: str = "",
        debug_prompt_payload=None,
    ):
        yield "partial", usage_scope
        raise ApiError(
            status_code=502,
            code="LLM_UPSTREAM_TEST",
            message="Simulated upstream failure.",
        )

    await engine.dispose()

    try:
        with TestClient(app) as tc:
            tc.post(
                "/auth/register",
                json={
                    "email": f"pc-fail-{sfx}@example.com",
                    "password": "securepass123",
                    "display_name": "wsuser",
                },
            )
            tok = tc.cookies.get("atelier_token")
            assert tok
            promote_platform_admin_sync(f"pc-fail-{sfx}@example.com")
            cr = tc.post("/admin/studios", json={"name": f"PcFail{sfx}", "description": "d"})
            assert cr.status_code == 200
            studio_id = cr.json()["id"]
            sw = tc.post(
                f"/studios/{studio_id}/software",
                json={"name": "SWSF", "description": None},
            )
            assert sw.status_code == 200
            software_id = sw.json()["id"]
            pr = tc.post(
                f"/software/{software_id}/projects",
                json={"name": "Pfail", "description": None},
            )
            assert pr.status_code == 200
            local_pid = pr.json()["id"]

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
                    "app.agents.project_chat_agent.ProjectChatAgent.stream_assistant_tokens",
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
                    f"/ws/projects/{local_pid}/chat?token={tok}"
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
                            assert msg.get("code") == "LLM_UPSTREAM_TEST"
                            assert "Simulated" in (msg.get("message") or "")
                            break
                        if msg.get("type") == "assistant_done":
                            saw_done = True
                    assert saw_token and saw_error and not saw_done

            hist = tc.get(f"/projects/{local_pid}/chat")
            assert hist.status_code == 200
            messages = hist.json()["messages"]
            roles = [m["role"] for m in messages]
            assert roles.count("user") == 1
            assert roles.count("assistant") == 0
    finally:
        await engine.dispose()
