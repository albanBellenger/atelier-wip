"""LLM client behavior via LiteLLM (timeouts / transport → ApiError)."""

from __future__ import annotations

import json
import uuid
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from openai import (
    APIConnectionError,
    APITimeoutError,
    AuthenticationError,
    BadRequestError,
    InternalServerError,
    RateLimitError,
)
from sqlalchemy import delete

from app.exceptions import ApiError
from app.models import LlmProviderRegistry, LlmRoutingRule
from app.schemas.auth import AdminConnectivityResult
from app.schemas.token_usage_scope import TokenUsageScope
from app.security.field_encryption import encode_admin_stored_secret
from app.services.llm_service import LLMService

_REQ = httpx.Request("POST", "https://example.test/v1/chat/completions")


async def _seed_openai_default_llm(db_session: Any, *, model: str, api_key: str = "sk-test") -> None:
    await db_session.execute(delete(LlmRoutingRule))
    await db_session.execute(delete(LlmProviderRegistry))
    await db_session.flush()
    db_session.add(
        LlmProviderRegistry(
            id=uuid.uuid4(),
            provider_key="openai",
            display_name="OpenAI",
            models_json=json.dumps([model]),
            api_base_url=None,
            logo_url=None,
            status="connected",
            is_default=True,
            sort_order=0,
            api_key=encode_admin_stored_secret(api_key),
            litellm_provider_slug="openai",
        )
    )
    db_session.add(
        LlmRoutingRule(use_case="chat", primary_model=model, fallback_model=None),
    )
    await db_session.flush()


def _resp(status: int) -> httpx.Response:
    return httpx.Response(status, request=_REQ)


def _usage_scope() -> TokenUsageScope:
    return TokenUsageScope(
        studio_id=uuid.uuid4(),
        software_id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
    )


@pytest.mark.asyncio
async def test_chat_structured_read_timeout_maps_to_api_error(
    db_session: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _seed_openai_default_llm(db_session, model="gpt-test")

    monkeypatch.setattr(
        "app.services.llm_service.litellm.acompletion",
        AsyncMock(side_effect=APITimeoutError(request=_REQ)),
    )

    llm = LLMService(db_session)
    with pytest.raises(ApiError) as exc_info:
        await llm.chat_structured(
            system_prompt="s",
            user_prompt="u",
            json_schema={"name": "x", "strict": True, "schema": {"type": "object"}},
            usage_scope=_usage_scope(),
            call_type="test",
        )
    assert exc_info.value.status_code == 504
    assert exc_info.value.error_code == "LLM_TIMEOUT"


@pytest.mark.asyncio
async def test_chat_structured_connect_error_maps_to_transport_api_error(
    db_session: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _seed_openai_default_llm(db_session, model="gpt-test")

    monkeypatch.setattr(
        "app.services.llm_service.litellm.acompletion",
        AsyncMock(side_effect=APIConnectionError(message="refused", request=_REQ)),
    )

    llm = LLMService(db_session)
    with pytest.raises(ApiError) as exc_info:
        await llm.chat_structured(
            system_prompt="s",
            user_prompt="u",
            json_schema={"name": "x", "strict": True, "schema": {"type": "object"}},
            usage_scope=_usage_scope(),
            call_type="test",
        )
    assert exc_info.value.status_code == 502
    assert exc_info.value.error_code == "LLM_TRANSPORT_ERROR"


@pytest.mark.asyncio
async def test_chat_stream_connect_error_maps_to_transport_api_error(
    db_session: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _seed_openai_default_llm(db_session, model="gpt-test")

    monkeypatch.setattr(
        "app.services.llm_service.litellm.acompletion",
        AsyncMock(side_effect=APIConnectionError(message="down", request=_REQ)),
    )

    llm = LLMService(db_session)
    gen = llm.chat_stream(
        system_prompt="s",
        messages=[{"role": "user", "content": "hi"}],
        usage_scope=_usage_scope(),
        call_type="test",
    )
    with pytest.raises(ApiError) as exc_info:
        async for _ in gen:
            pass
    assert exc_info.value.error_code == "LLM_TRANSPORT_ERROR"


@pytest.mark.asyncio
async def test_admin_connectivity_probe_missing_model_returns_result(db_session: Any) -> None:
    await db_session.execute(delete(LlmRoutingRule))
    await db_session.execute(delete(LlmProviderRegistry))
    await db_session.flush()

    llm = LLMService(db_session)
    out = await llm.admin_connectivity_probe()
    assert isinstance(out, AdminConnectivityResult)
    assert out.ok is False
    assert "model" in (out.message or "").lower() or "configure" in (out.message or "").lower()


@pytest.mark.asyncio
async def test_admin_connectivity_probe_unknown_provider_key_returns_result(
    db_session: Any,
) -> None:
    await _seed_openai_default_llm(db_session, model="gpt-test")

    llm = LLMService(db_session)
    out = await llm.admin_connectivity_probe(
        model_override="gpt-test",
        provider_key="no-such-provider",
    )
    assert out.ok is False
    assert "unknown" in (out.message or "").lower()


def _probe_ok_response() -> MagicMock:
    msg = MagicMock()
    msg.content = " OK "
    msg.model_dump = lambda: {"content": " OK "}  # type: ignore[method-assign]
    ch = MagicMock()
    ch.message = msg
    resp = MagicMock()
    resp.choices = [ch]
    return resp


@pytest.mark.asyncio
async def test_admin_connectivity_probe_success(db_session: Any, monkeypatch: pytest.MonkeyPatch) -> None:
    await _seed_openai_default_llm(db_session, model="gpt-test")

    monkeypatch.setattr(
        "app.services.llm_service.litellm.acompletion",
        AsyncMock(return_value=_probe_ok_response()),
    )

    llm = LLMService(db_session)
    out = await llm.admin_connectivity_probe()
    assert out.ok is True
    assert "succeeded" in (out.message or "").lower()
    assert out.detail == "OK"


@pytest.mark.asyncio
async def test_admin_connectivity_probe_http_error_returns_result(
    db_session: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _seed_openai_default_llm(db_session, model="gpt-test")

    monkeypatch.setattr(
        "app.services.llm_service.litellm.acompletion",
        AsyncMock(side_effect=AuthenticationError("unauthorized", response=_resp(401), body=None)),
    )

    llm = LLMService(db_session)
    out = await llm.admin_connectivity_probe()
    assert out.ok is False
    assert "error" in (out.message or "").lower() or "failed" in (out.message or "").lower()


@pytest.mark.asyncio
async def test_admin_connectivity_probe_network_error_returns_result(
    db_session: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _seed_openai_default_llm(db_session, model="gpt-test")

    monkeypatch.setattr(
        "app.services.llm_service.litellm.acompletion",
        AsyncMock(side_effect=APITimeoutError(request=_REQ)),
    )

    llm = LLMService(db_session)
    out = await llm.admin_connectivity_probe()
    assert out.ok is False
    assert "failed" in (out.message or "").lower() or "network" in (out.message or "").lower()


@pytest.mark.asyncio
async def test_admin_connectivity_probe_acompletion_unexpected_error_returns_result(
    db_session: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _seed_openai_default_llm(db_session, model="gpt-test")

    monkeypatch.setattr(
        "app.services.llm_service.litellm.acompletion",
        AsyncMock(side_effect=ValueError("unexpected")),
    )

    llm = LLMService(db_session)
    out = await llm.admin_connectivity_probe()
    assert out.ok is False
    assert (out.message or "") != ""


@pytest.mark.asyncio
async def test_chat_structured_upstream_http_error_maps_to_api_error(
    db_session: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _seed_openai_default_llm(db_session, model="gpt-test")

    monkeypatch.setattr(
        "app.services.llm_service.litellm.acompletion",
        AsyncMock(side_effect=InternalServerError("upstream", response=_resp(503), body=None)),
    )

    llm = LLMService(db_session)
    with pytest.raises(ApiError) as exc_info:
        await llm.chat_structured(
            system_prompt="s",
            user_prompt="u",
            json_schema={"name": "x", "strict": True, "schema": {"type": "object"}},
            usage_scope=_usage_scope(),
            call_type="test",
        )
    assert exc_info.value.status_code == 502
    assert exc_info.value.error_code == "LLM_UPSTREAM_ERROR"


_MIN_SCHEMA: dict[str, Any] = {"name": "x", "strict": True, "schema": {"type": "object"}}


def _structured_ok_response() -> MagicMock:
    msg = MagicMock()
    msg.content = '{"captured": true}'
    msg.model_dump = lambda: {"content": '{"captured": true}'}  # type: ignore[method-assign]
    ch = MagicMock()
    ch.message = msg
    usage = MagicMock()
    usage.model_dump = lambda: {"prompt_tokens": 0, "completion_tokens": 0}  # type: ignore[method-assign]
    resp = MagicMock()
    resp.choices = [ch]
    resp.usage = usage
    return resp


@pytest.mark.asyncio
async def test_chat_structured_posts_openai_json_schema_request_body(
    db_session: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: list[Any] = []

    async def capture_ac(*args: object, **kwargs: object) -> MagicMock:
        captured.append(kwargs)
        return _structured_ok_response()

    await _seed_openai_default_llm(db_session, model="gpt-test")

    monkeypatch.setattr(
        "app.services.llm_service.litellm.acompletion",
        AsyncMock(side_effect=capture_ac),
    )

    llm = LLMService(db_session)
    schema = {"name": "hint", "strict": True, "schema": {"type": "object"}}
    out = await llm.chat_structured(
        system_prompt="sys",
        user_prompt="user",
        json_schema=schema,
        usage_scope=_usage_scope(),
        call_type="test",
    )
    assert out == {"captured": True}
    assert len(captured) == 1
    body = captured[0]
    assert isinstance(body, dict)
    assert body["model"] == "openai/gpt-test"
    assert body["messages"] == [
        {"role": "system", "content": "sys"},
        {"role": "user", "content": "user"},
    ]
    assert body["response_format"] == {
        "type": "json_schema",
        "json_schema": schema,
    }


@pytest.mark.asyncio
async def test_chat_structured_rejects_json_schema_not_dict(db_session: Any) -> None:
    llm = LLMService(db_session)
    bad_schema: Any = []
    with pytest.raises(ApiError) as exc_info:
        await llm.chat_structured(
            system_prompt="s",
            user_prompt="u",
            json_schema=bad_schema,
            usage_scope=_usage_scope(),
            call_type="test",
        )
    assert exc_info.value.error_code == "LLM_SCHEMA_INVALID"
    assert exc_info.value.status_code == 500


@pytest.mark.asyncio
async def test_chat_structured_rejects_json_schema_empty_name(db_session: Any) -> None:
    llm = LLMService(db_session)
    with pytest.raises(ApiError) as exc_info:
        await llm.chat_structured(
            system_prompt="s",
            user_prompt="u",
            json_schema={"name": "  ", "strict": True, "schema": {"type": "object"}},
            usage_scope=_usage_scope(),
            call_type="test",
        )
    assert exc_info.value.error_code == "LLM_SCHEMA_INVALID"


@pytest.mark.asyncio
async def test_chat_structured_rejects_json_schema_strict_not_true(db_session: Any) -> None:
    llm = LLMService(db_session)
    with pytest.raises(ApiError) as exc_info:
        await llm.chat_structured(
            system_prompt="s",
            user_prompt="u",
            json_schema={"name": "n", "strict": False, "schema": {"type": "object"}},
            usage_scope=_usage_scope(),
            call_type="test",
        )
    assert exc_info.value.error_code == "LLM_SCHEMA_INVALID"


@pytest.mark.asyncio
async def test_chat_structured_rejects_json_schema_inner_not_object(db_session: Any) -> None:
    llm = LLMService(db_session)
    with pytest.raises(ApiError) as exc_info:
        await llm.chat_structured(
            system_prompt="s",
            user_prompt="u",
            json_schema={
                "name": "n",
                "strict": True,
                "schema": {"type": "array", "items": {"type": "string"}},
            },
            usage_scope=_usage_scope(),
            call_type="test",
        )
    assert exc_info.value.error_code == "LLM_SCHEMA_INVALID"


@pytest.mark.asyncio
async def test_chat_structured_upstream_error_log_omits_raw_body(
    db_session: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _seed_openai_default_llm(db_session, model="gpt-test")

    captured: list[tuple[str, dict[str, Any]]] = []

    def capture_warning(event: str, **kw: Any) -> None:
        captured.append((event, kw))

    from app.services import litellm_exception_mapping as lem

    monkeypatch.setattr(lem.log, "warning", capture_warning)
    monkeypatch.setattr(
        "app.services.llm_service.litellm.acompletion",
        AsyncMock(
            side_effect=BadRequestError(
                "bad request",
                response=_resp(400),
                body={"error": {"message": "USER_SECRET_PROMPT"}},
            )
        ),
    )

    llm = LLMService(db_session)
    with pytest.raises(ApiError):
        await llm.chat_structured(
            system_prompt="s",
            user_prompt="u",
            json_schema=_MIN_SCHEMA,
            usage_scope=_usage_scope(),
            call_type="test",
        )
    blob = str(captured)
    assert "USER_SECRET_PROMPT" not in blob
    assert any(rec[0] == "litellm_upstream_error" for rec in captured)


@pytest.mark.asyncio
async def test_chat_structured_empty_choices_maps_to_api_error(
    db_session: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _seed_openai_default_llm(db_session, model="gpt-test")

    resp = MagicMock()
    resp.choices = []
    resp.usage = {}
    monkeypatch.setattr(
        "app.services.llm_service.litellm.acompletion",
        AsyncMock(return_value=resp),
    )

    llm = LLMService(db_session)
    with pytest.raises(ApiError) as exc_info:
        await llm.chat_structured(
            system_prompt="s",
            user_prompt="u",
            json_schema={"name": "x", "strict": True, "schema": {"type": "object"}},
            usage_scope=_usage_scope(),
            call_type="test",
        )
    assert exc_info.value.error_code == "LLM_EMPTY_RESPONSE"


@pytest.mark.asyncio
async def test_chat_structured_invalid_content_json_maps_to_api_error(
    db_session: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _seed_openai_default_llm(db_session, model="gpt-test")

    msg = MagicMock()
    msg.content = "not valid json {"
    msg.model_dump = lambda: {"content": "not valid json {"}  # type: ignore[method-assign]
    ch = MagicMock()
    ch.message = msg
    resp = MagicMock()
    resp.choices = [ch]
    resp.usage = {"prompt_tokens": 0, "completion_tokens": 0}
    monkeypatch.setattr(
        "app.services.llm_service.litellm.acompletion",
        AsyncMock(return_value=resp),
    )

    llm = LLMService(db_session)
    with pytest.raises(ApiError) as exc_info:
        await llm.chat_structured(
            system_prompt="s",
            user_prompt="u",
            json_schema={"name": "x", "strict": True, "schema": {"type": "object"}},
            usage_scope=_usage_scope(),
            call_type="test",
        )
    assert exc_info.value.error_code == "LLM_INVALID_JSON"


async def _stream_chunks_timeout() -> Any:
    yield MagicMock(choices=[MagicMock(delta=MagicMock(content="a"))])
    raise APITimeoutError(request=_REQ)


@pytest.mark.asyncio
async def test_chat_stream_read_timeout_maps_to_api_error(
    db_session: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _seed_openai_default_llm(db_session, model="gpt-test")

    monkeypatch.setattr(
        "app.services.llm_service.litellm.acompletion",
        AsyncMock(return_value=_stream_chunks_timeout()),
    )

    llm = LLMService(db_session)
    gen = llm.chat_stream(
        system_prompt="s",
        messages=[{"role": "user", "content": "hi"}],
        usage_scope=_usage_scope(),
        call_type="test",
    )
    with pytest.raises(ApiError) as exc_info:
        async for _ in gen:
            pass
    assert exc_info.value.error_code == "LLM_TIMEOUT"


async def _stream_chunks_rate_limit() -> Any:
    yield MagicMock(choices=[MagicMock(delta=MagicMock(content="a"))])
    raise RateLimitError("rate limited", response=_resp(429), body=None)


@pytest.mark.asyncio
async def test_chat_stream_upstream_rate_limit_maps_to_api_error(
    db_session: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _seed_openai_default_llm(db_session, model="gpt-test")

    monkeypatch.setattr(
        "app.services.llm_service.litellm.acompletion",
        AsyncMock(return_value=_stream_chunks_rate_limit()),
    )

    llm = LLMService(db_session)
    gen = llm.chat_stream(
        system_prompt="s",
        messages=[{"role": "user", "content": "hi"}],
        usage_scope=_usage_scope(),
        call_type="test",
    )
    with pytest.raises(ApiError) as exc_info:
        async for _ in gen:
            pass
    assert exc_info.value.error_code == "LLM_RATE_LIMITED"
    assert exc_info.value.status_code == 429


@pytest.mark.asyncio
async def test_chat_stream_upstream_error_log_omits_raw_body(
    db_session: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _seed_openai_default_llm(db_session, model="gpt-test")

    captured: list[tuple[str, dict[str, Any]]] = []

    def capture_warning(event: str, **kw: Any) -> None:
        captured.append((event, kw))

    from app.services import litellm_exception_mapping as lem

    monkeypatch.setattr(lem.log, "warning", capture_warning)

    async def bad_stream() -> Any:
        yield MagicMock(choices=[MagicMock(delta=MagicMock(content="a"))])
        raise RateLimitError(
            "safe message",
            response=_resp(429),
            body={"error": {"message": "USER_SECRET_PROMPT"}},
        )

    monkeypatch.setattr(
        "app.services.llm_service.litellm.acompletion",
        AsyncMock(return_value=bad_stream()),
    )

    llm = LLMService(db_session)
    gen = llm.chat_stream(
        system_prompt="s",
        messages=[{"role": "user", "content": "hi"}],
        usage_scope=_usage_scope(),
        call_type="test",
    )
    with pytest.raises(ApiError):
        async for _ in gen:
            pass
    assert "USER_SECRET_PROMPT" not in str(captured)
    assert any(rec[0] == "litellm_upstream_error" for rec in captured)


@pytest.mark.asyncio
async def test_trim_chat_messages_for_stream_uses_model_from_config(
    db_session: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _seed_openai_default_llm(db_session, model="gpt-test")

    with patch(
        "app.services.llm_service.trim_openai_chat_messages",
        return_value=([{"role": "user", "content": "x"}], True),
    ) as mock_trim:
        llm = LLMService(db_session)
        out, trimmed = await llm.trim_chat_messages_for_stream(
            [{"role": "user", "content": "hello"}],
            usage_scope=_usage_scope(),
            call_type="chat",
        )
    assert trimmed is True
    assert out == [{"role": "user", "content": "x"}]
    mock_trim.assert_called_once()
    _args, kwargs = mock_trim.call_args
    assert kwargs["model"] == "openai/gpt-test"


def _settings_mock(*, log_prompts: bool) -> MagicMock:
    s = MagicMock()
    s.log_llm_prompts = log_prompts
    return s


@pytest.mark.asyncio
async def test_llm_outbound_request_includes_full_messages_when_log_prompts_enabled(
    db_session: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _seed_openai_default_llm(db_session, model="gpt-test")
    monkeypatch.setattr(
        "app.services.llm_service.get_settings",
        lambda: _settings_mock(log_prompts=True),
    )
    mock_info = MagicMock()
    monkeypatch.setattr("app.services.llm_service.log.info", mock_info)
    monkeypatch.setattr(
        "app.services.llm_service.litellm.acompletion",
        AsyncMock(return_value=_structured_ok_response()),
    )
    scope = _usage_scope()
    llm = LLMService(db_session)
    await llm.chat_structured(
        system_prompt="sys-body",
        user_prompt="user-body",
        json_schema={"name": "wo_schema", "strict": True, "schema": {"type": "object"}},
        usage_scope=scope,
        call_type="work_order",
    )
    outbound = [
        c
        for c in mock_info.call_args_list
        if c.args and c.args[0] == "llm_outbound_request"
    ]
    assert len(outbound) == 1
    payload = outbound[0].kwargs
    assert payload["messages"] == [
        {"role": "system", "content": "sys-body"},
        {"role": "user", "content": "user-body"},
    ]
    assert payload["json_schema_name"] == "wo_schema"
    assert payload["call_type"] == "work_order"
    assert payload["stream"] is False
    assert payload["message_roles"] == ["system", "user"]
    assert payload["message_char_lens"] == [8, 9]
    assert payload["studio_id"] == str(scope.studio_id)


@pytest.mark.asyncio
async def test_llm_outbound_request_omits_message_bodies_when_log_prompts_disabled(
    db_session: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _seed_openai_default_llm(db_session, model="gpt-test")
    monkeypatch.setattr(
        "app.services.llm_service.get_settings",
        lambda: _settings_mock(log_prompts=False),
    )
    captured: list[str] = []

    def capture_info(*args: Any, **kwargs: Any) -> None:
        captured.append(f"{args!r}{kwargs!r}")

    monkeypatch.setattr("app.services.llm_service.log.info", capture_info)
    monkeypatch.setattr(
        "app.services.llm_service.litellm.acompletion",
        AsyncMock(return_value=_structured_ok_response()),
    )
    secret = "NEVER_LOG_THIS_SECRET_TOKEN_XYZ"
    llm = LLMService(db_session)
    await llm.chat_structured(
        system_prompt="s",
        user_prompt=secret,
        json_schema=_MIN_SCHEMA,
        usage_scope=_usage_scope(),
        call_type="test",
    )
    blob = "\n".join(captured)
    assert secret not in blob
    assert any("llm_outbound_request" in line for line in captured)
    for line in captured:
        if "llm_outbound_request" in line:
            assert "NEVER_LOG" not in line
            assert "'messages'" not in line


@pytest.mark.asyncio
async def test_llm_outbound_request_stream_includes_messages_when_enabled(
    db_session: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _seed_openai_default_llm(db_session, model="gpt-test")
    monkeypatch.setattr(
        "app.services.llm_service.get_settings",
        lambda: _settings_mock(log_prompts=True),
    )
    mock_info = MagicMock()
    monkeypatch.setattr("app.services.llm_service.log.info", mock_info)

    async def _one_chunk() -> Any:
        yield MagicMock(choices=[MagicMock(delta=MagicMock(content="x"))])

    monkeypatch.setattr(
        "app.services.llm_service.litellm.acompletion",
        AsyncMock(return_value=_one_chunk()),
    )
    monkeypatch.setattr(
        "app.services.llm_service.record_usage",
        AsyncMock(),
    )
    llm = LLMService(db_session)
    gen = llm.chat_stream(
        system_prompt="sys2",
        messages=[{"role": "user", "content": "uh"}],
        usage_scope=_usage_scope(),
        call_type="chat",
    )
    async for _ in gen:
        pass
    outbound = [
        c
        for c in mock_info.call_args_list
        if c.args and c.args[0] == "llm_outbound_request"
    ]
    assert len(outbound) == 1
    assert outbound[0].kwargs["stream"] is True
    assert outbound[0].kwargs["messages"] == [
        {"role": "system", "content": "sys2"},
        {"role": "user", "content": "uh"},
    ]


@pytest.mark.asyncio
async def test_llm_outbound_request_truncates_long_message_when_log_prompts_enabled(
    db_session: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _seed_openai_default_llm(db_session, model="gpt-test")
    monkeypatch.setattr(
        "app.services.llm_service.get_settings",
        lambda: _settings_mock(log_prompts=True),
    )
    monkeypatch.setattr("app.services.llm_service._MAX_LLM_LOG_MESSAGE_CHARS", 5)
    mock_info = MagicMock()
    monkeypatch.setattr("app.services.llm_service.log.info", mock_info)
    monkeypatch.setattr(
        "app.services.llm_service.litellm.acompletion",
        AsyncMock(return_value=_structured_ok_response()),
    )
    llm = LLMService(db_session)
    await llm.chat_structured(
        system_prompt="s",
        user_prompt="123456789",
        json_schema=_MIN_SCHEMA,
        usage_scope=_usage_scope(),
        call_type="test",
    )
    outbound = [
        c
        for c in mock_info.call_args_list
        if c.args and c.args[0] == "llm_outbound_request"
    ]
    msgs = outbound[0].kwargs["messages"]
    assert msgs[1]["content"] == "12345…[truncated]"
