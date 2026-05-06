"""LLM client behavior via LiteLLM (timeouts / transport → ApiError)."""

from __future__ import annotations

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

from app.exceptions import ApiError
from app.models import AdminConfig
from app.schemas.auth import AdminConnectivityResult
from app.schemas.token_context import TokenContext
from app.services.llm_service import LLMService

_REQ = httpx.Request("POST", "https://example.test/v1/chat/completions")


def _resp(status: int) -> httpx.Response:
    return httpx.Response(status, request=_REQ)


def _token_ctx() -> TokenContext:
    return TokenContext(
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
    row = await db_session.get(AdminConfig, 1)
    assert row is not None
    row.llm_model = "gpt-test"
    row.llm_api_key = "sk-test"
    row.llm_provider = "openai"
    await db_session.flush()

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
            context=_token_ctx(),
            call_type="test",
        )
    assert exc_info.value.status_code == 504
    assert exc_info.value.error_code == "LLM_TIMEOUT"


@pytest.mark.asyncio
async def test_chat_structured_connect_error_maps_to_transport_api_error(
    db_session: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    row = await db_session.get(AdminConfig, 1)
    assert row is not None
    row.llm_model = "gpt-test"
    row.llm_api_key = "sk-test"
    row.llm_provider = "openai"
    await db_session.flush()

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
            context=_token_ctx(),
            call_type="test",
        )
    assert exc_info.value.status_code == 502
    assert exc_info.value.error_code == "LLM_TRANSPORT_ERROR"


@pytest.mark.asyncio
async def test_chat_stream_connect_error_maps_to_transport_api_error(
    db_session: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    row = await db_session.get(AdminConfig, 1)
    assert row is not None
    row.llm_model = "gpt-test"
    row.llm_api_key = "sk-test"
    row.llm_provider = "openai"
    await db_session.flush()

    monkeypatch.setattr(
        "app.services.llm_service.litellm.acompletion",
        AsyncMock(side_effect=APIConnectionError(message="down", request=_REQ)),
    )

    llm = LLMService(db_session)
    gen = llm.chat_stream(
        system_prompt="s",
        messages=[{"role": "user", "content": "hi"}],
        context=_token_ctx(),
        call_type="test",
    )
    with pytest.raises(ApiError) as exc_info:
        async for _ in gen:
            pass
    assert exc_info.value.error_code == "LLM_TRANSPORT_ERROR"


@pytest.mark.asyncio
async def test_admin_connectivity_probe_missing_model_returns_result(db_session: Any) -> None:
    row = await db_session.get(AdminConfig, 1)
    assert row is not None
    row.llm_model = ""
    row.llm_api_key = "sk-test"
    row.llm_provider = "openai"
    await db_session.flush()

    llm = LLMService(db_session)
    out = await llm.admin_connectivity_probe()
    assert isinstance(out, AdminConnectivityResult)
    assert out.ok is False
    assert "Configure LLM model and API key" in (out.message or "")


@pytest.mark.asyncio
async def test_admin_connectivity_probe_unsupported_provider_returns_result(db_session: Any) -> None:
    row = await db_session.get(AdminConfig, 1)
    assert row is not None
    row.llm_model = "gpt-test"
    row.llm_api_key = "sk-test"
    row.llm_provider = "azure"
    await db_session.flush()

    llm = LLMService(db_session)
    out = await llm.admin_connectivity_probe()
    assert out.ok is False
    assert "openai" in (out.message or "").lower() or "openai" in (out.detail or "").lower()


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
    row = await db_session.get(AdminConfig, 1)
    assert row is not None
    row.llm_model = "gpt-test"
    row.llm_api_key = "sk-test"
    row.llm_provider = "openai"
    await db_session.flush()

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
    row = await db_session.get(AdminConfig, 1)
    assert row is not None
    row.llm_model = "gpt-test"
    row.llm_api_key = "sk-test"
    row.llm_provider = "openai"
    await db_session.flush()

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
    row = await db_session.get(AdminConfig, 1)
    assert row is not None
    row.llm_model = "gpt-test"
    row.llm_api_key = "sk-test"
    row.llm_provider = "openai"
    await db_session.flush()

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
    row = await db_session.get(AdminConfig, 1)
    assert row is not None
    row.llm_model = "gpt-test"
    row.llm_api_key = "sk-test"
    row.llm_provider = "openai"
    await db_session.flush()

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
    row = await db_session.get(AdminConfig, 1)
    assert row is not None
    row.llm_model = "gpt-test"
    row.llm_api_key = "sk-test"
    row.llm_provider = "openai"
    await db_session.flush()

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
            context=_token_ctx(),
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

    row = await db_session.get(AdminConfig, 1)
    assert row is not None
    row.llm_model = "gpt-test"
    row.llm_api_key = "sk-test"
    row.llm_provider = "openai"
    await db_session.flush()

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
        context=_token_ctx(),
        call_type="test",
    )
    assert out == {"captured": True}
    assert len(captured) == 1
    body = captured[0]
    assert isinstance(body, dict)
    assert body["model"] == "gpt-test"
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
            context=_token_ctx(),
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
            context=_token_ctx(),
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
            context=_token_ctx(),
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
            context=_token_ctx(),
            call_type="test",
        )
    assert exc_info.value.error_code == "LLM_SCHEMA_INVALID"


@pytest.mark.asyncio
async def test_chat_structured_upstream_error_log_omits_raw_body(
    db_session: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    row = await db_session.get(AdminConfig, 1)
    assert row is not None
    row.llm_model = "gpt-test"
    row.llm_api_key = "sk-test"
    row.llm_provider = "openai"
    await db_session.flush()

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
            context=_token_ctx(),
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
    row = await db_session.get(AdminConfig, 1)
    assert row is not None
    row.llm_model = "gpt-test"
    row.llm_api_key = "sk-test"
    row.llm_provider = "openai"
    await db_session.flush()

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
            context=_token_ctx(),
            call_type="test",
        )
    assert exc_info.value.error_code == "LLM_EMPTY_RESPONSE"


@pytest.mark.asyncio
async def test_chat_structured_invalid_content_json_maps_to_api_error(
    db_session: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    row = await db_session.get(AdminConfig, 1)
    assert row is not None
    row.llm_model = "gpt-test"
    row.llm_api_key = "sk-test"
    row.llm_provider = "openai"
    await db_session.flush()

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
            context=_token_ctx(),
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
    row = await db_session.get(AdminConfig, 1)
    assert row is not None
    row.llm_model = "gpt-test"
    row.llm_api_key = "sk-test"
    row.llm_provider = "openai"
    await db_session.flush()

    monkeypatch.setattr(
        "app.services.llm_service.litellm.acompletion",
        AsyncMock(return_value=_stream_chunks_timeout()),
    )

    llm = LLMService(db_session)
    gen = llm.chat_stream(
        system_prompt="s",
        messages=[{"role": "user", "content": "hi"}],
        context=_token_ctx(),
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
    row = await db_session.get(AdminConfig, 1)
    assert row is not None
    row.llm_model = "gpt-test"
    row.llm_api_key = "sk-test"
    row.llm_provider = "openai"
    await db_session.flush()

    monkeypatch.setattr(
        "app.services.llm_service.litellm.acompletion",
        AsyncMock(return_value=_stream_chunks_rate_limit()),
    )

    llm = LLMService(db_session)
    gen = llm.chat_stream(
        system_prompt="s",
        messages=[{"role": "user", "content": "hi"}],
        context=_token_ctx(),
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
    row = await db_session.get(AdminConfig, 1)
    assert row is not None
    row.llm_model = "gpt-test"
    row.llm_api_key = "sk-test"
    row.llm_provider = "openai"
    await db_session.flush()

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
        context=_token_ctx(),
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
    row = await db_session.get(AdminConfig, 1)
    assert row is not None
    row.llm_model = "gpt-test"
    row.llm_api_key = "sk-test"
    row.llm_provider = "openai"
    await db_session.flush()

    with patch(
        "app.services.llm_service.trim_openai_chat_messages",
        return_value=([{"role": "user", "content": "x"}], True),
    ) as mock_trim:
        llm = LLMService(db_session)
        out, trimmed = await llm.trim_chat_messages_for_stream(
            [{"role": "user", "content": "hello"}],
            context=_token_ctx(),
            call_type="chat",
        )
    assert trimmed is True
    assert out == [{"role": "user", "content": "x"}]
    mock_trim.assert_called_once()
    _args, kwargs = mock_trim.call_args
    assert kwargs["model"] == "gpt-test"
