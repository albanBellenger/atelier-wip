"""LLM client behavior (timeouts → ApiError)."""

from typing import Any
import uuid

import httpx
import pytest

from app.exceptions import ApiError
from app.models import AdminConfig
from app.schemas.auth import AdminConnectivityResult
from app.schemas.token_context import TokenContext
from app.services.llm_service import LLMService


class _TimeoutAsyncClient:
    """AsyncClient stand-in that raises on POST."""

    def __init__(self, *args: object, **kwargs: object) -> None:
        pass

    async def __aenter__(self) -> "_TimeoutAsyncClient":
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    async def post(self, *args: object, **kwargs: object) -> object:
        raise httpx.ReadTimeout("read timeout", request=None)


@pytest.mark.asyncio
async def test_chat_structured_read_timeout_maps_to_api_error(
    db_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    row = await db_session.get(AdminConfig, 1)
    assert row is not None
    row.llm_model = "gpt-test"
    row.llm_api_key = "sk-test"
    row.llm_provider = "openai"
    await db_session.flush()

    monkeypatch.setattr(
        "app.services.llm_service.httpx.AsyncClient",
        _TimeoutAsyncClient,
    )

    llm = LLMService(db_session)
    ctx = TokenContext(
        studio_id=uuid.uuid4(),
        software_id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
    )
    with pytest.raises(ApiError) as exc_info:
        await llm.chat_structured(
            system_prompt="s",
            user_prompt="u",
            json_schema={"name": "x", "strict": True, "schema": {"type": "object"}},
            context=ctx,
            call_type="test",
        )
    assert exc_info.value.status_code == 504
    assert exc_info.value.error_code == "LLM_TIMEOUT"


class _ConnectFailAsyncClient:
    def __init__(self, *args: object, **kwargs: object) -> None:
        pass

    async def __aenter__(self) -> "_ConnectFailAsyncClient":
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    async def post(self, *args: object, **kwargs: object) -> object:
        raise httpx.ConnectError("refused", request=None)


@pytest.mark.asyncio
async def test_chat_structured_connect_error_maps_to_transport_api_error(
    db_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    row = await db_session.get(AdminConfig, 1)
    assert row is not None
    row.llm_model = "gpt-test"
    row.llm_api_key = "sk-test"
    row.llm_provider = "openai"
    await db_session.flush()

    monkeypatch.setattr(
        "app.services.llm_service.httpx.AsyncClient",
        _ConnectFailAsyncClient,
    )

    llm = LLMService(db_session)
    ctx = TokenContext(
        studio_id=uuid.uuid4(),
        software_id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
    )
    with pytest.raises(ApiError) as exc_info:
        await llm.chat_structured(
            system_prompt="s",
            user_prompt="u",
            json_schema={"name": "x", "strict": True, "schema": {"type": "object"}},
            context=ctx,
            call_type="test",
        )
    assert exc_info.value.status_code == 502
    assert exc_info.value.error_code == "LLM_TRANSPORT_ERROR"


class _StreamConnectFailClient:
    def __init__(self, *args: object, **kwargs: object) -> None:
        pass

    async def __aenter__(self) -> "_StreamConnectFailClient":
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    def stream(self, *args: object, **kwargs: object) -> "_BadStreamCtx":
        return _BadStreamCtx()


class _BadStreamCtx:
    async def __aenter__(self) -> None:
        raise httpx.ConnectError("down", request=None)

    async def __aexit__(self, *args: object) -> None:
        return None


@pytest.mark.asyncio
async def test_chat_stream_connect_error_maps_to_transport_api_error(
    db_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    row = await db_session.get(AdminConfig, 1)
    assert row is not None
    row.llm_model = "gpt-test"
    row.llm_api_key = "sk-test"
    row.llm_provider = "openai"
    await db_session.flush()

    monkeypatch.setattr(
        "app.services.llm_service.httpx.AsyncClient",
        _StreamConnectFailClient,
    )

    llm = LLMService(db_session)
    ctx = TokenContext(
        studio_id=uuid.uuid4(),
        software_id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
    )
    gen = llm.chat_stream(
        system_prompt="s",
        messages=[{"role": "user", "content": "hi"}],
        context=ctx,
        call_type="test",
    )
    with pytest.raises(ApiError) as exc_info:
        async for _ in gen:
            pass
    assert exc_info.value.error_code == "LLM_TRANSPORT_ERROR"


@pytest.mark.asyncio
async def test_admin_connectivity_probe_missing_model_returns_result(
    db_session,
) -> None:
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
async def test_admin_connectivity_probe_unsupported_provider_returns_result(
    db_session,
) -> None:
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


class _ProbeOkResponse:
    status_code = 200
    text = ""

    def json(self) -> dict:
        return {"choices": [{"message": {"content": " OK "}}]}


class _ProbePostOkClient:
    def __init__(self, *args: object, **kwargs: object) -> None:
        pass

    async def __aenter__(self) -> "_ProbePostOkClient":
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    async def post(self, *args: object, **kwargs: object) -> _ProbeOkResponse:
        return _ProbeOkResponse()


@pytest.mark.asyncio
async def test_admin_connectivity_probe_success(
    db_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    row = await db_session.get(AdminConfig, 1)
    assert row is not None
    row.llm_model = "gpt-test"
    row.llm_api_key = "sk-test"
    row.llm_provider = "openai"
    await db_session.flush()

    monkeypatch.setattr(
        "app.services.llm_service.httpx.AsyncClient",
        _ProbePostOkClient,
    )

    llm = LLMService(db_session)
    out = await llm.admin_connectivity_probe()
    assert out.ok is True
    assert "succeeded" in (out.message or "").lower()
    assert out.detail == "OK"


class _ProbeHttpErrResponse:
    status_code = 401
    text = "unauthorized"

    def json(self) -> dict:
        return {}


class _ProbePostHttpErrClient:
    def __init__(self, *args: object, **kwargs: object) -> None:
        pass

    async def __aenter__(self) -> "_ProbePostHttpErrClient":
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    async def post(self, *args: object, **kwargs: object) -> _ProbeHttpErrResponse:
        return _ProbeHttpErrResponse()


@pytest.mark.asyncio
async def test_admin_connectivity_probe_http_error_returns_result(
    db_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    row = await db_session.get(AdminConfig, 1)
    assert row is not None
    row.llm_model = "gpt-test"
    row.llm_api_key = "sk-test"
    row.llm_provider = "openai"
    await db_session.flush()

    monkeypatch.setattr(
        "app.services.llm_service.httpx.AsyncClient",
        _ProbePostHttpErrClient,
    )

    llm = LLMService(db_session)
    out = await llm.admin_connectivity_probe()
    assert out.ok is False
    assert "error" in (out.message or "").lower()
    assert "unauthorized" in (out.detail or "")


class _ProbePostNetworkErrClient:
    def __init__(self, *args: object, **kwargs: object) -> None:
        pass

    async def __aenter__(self) -> "_ProbePostNetworkErrClient":
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    async def post(self, *args: object, **kwargs: object) -> object:
        raise httpx.ReadTimeout("read timeout", request=None)


@pytest.mark.asyncio
async def test_admin_connectivity_probe_network_error_returns_result(
    db_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    row = await db_session.get(AdminConfig, 1)
    assert row is not None
    row.llm_model = "gpt-test"
    row.llm_api_key = "sk-test"
    row.llm_provider = "openai"
    await db_session.flush()

    monkeypatch.setattr(
        "app.services.llm_service.httpx.AsyncClient",
        _ProbePostNetworkErrClient,
    )

    llm = LLMService(db_session)
    out = await llm.admin_connectivity_probe()
    assert out.ok is False
    assert "failed" in (out.message or "").lower() or "network" in (out.message or "").lower()


class _ProbeBadJsonResponse:
    status_code = 200
    text = "not-json"

    def json(self) -> dict:
        raise ValueError("bad json")


class _ProbePostBadJsonClient:
    def __init__(self, *args: object, **kwargs: object) -> None:
        pass

    async def __aenter__(self) -> "_ProbePostBadJsonClient":
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    async def post(self, *args: object, **kwargs: object) -> _ProbeBadJsonResponse:
        return _ProbeBadJsonResponse()


@pytest.mark.asyncio
async def test_admin_connectivity_probe_invalid_json_body_returns_result(
    db_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    row = await db_session.get(AdminConfig, 1)
    assert row is not None
    row.llm_model = "gpt-test"
    row.llm_api_key = "sk-test"
    row.llm_provider = "openai"
    await db_session.flush()

    monkeypatch.setattr(
        "app.services.llm_service.httpx.AsyncClient",
        _ProbePostBadJsonClient,
    )

    llm = LLMService(db_session)
    out = await llm.admin_connectivity_probe()
    assert out.ok is False
    assert "Unexpected" in (out.message or "") or "unexpected" in (out.message or "").lower()


class _StructuredUpstreamErrorResponse:
    status_code = 503
    text = "upstream down"
    headers = httpx.Headers()

    def json(self) -> dict:
        return {}


class _StructuredUpstreamErrPostClient:
    def __init__(self, *args: object, **kwargs: object) -> None:
        pass

    async def __aenter__(self) -> "_StructuredUpstreamErrPostClient":
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    async def post(self, *args: object, **kwargs: object) -> object:
        return _StructuredUpstreamErrorResponse()


@pytest.mark.asyncio
async def test_chat_structured_upstream_http_error_maps_to_api_error(
    db_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    row = await db_session.get(AdminConfig, 1)
    assert row is not None
    row.llm_model = "gpt-test"
    row.llm_api_key = "sk-test"
    row.llm_provider = "openai"
    await db_session.flush()

    monkeypatch.setattr(
        "app.services.llm_service.httpx.AsyncClient",
        _StructuredUpstreamErrPostClient,
    )

    llm = LLMService(db_session)
    ctx = TokenContext(
        studio_id=uuid.uuid4(),
        software_id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
    )
    with pytest.raises(ApiError) as exc_info:
        await llm.chat_structured(
            system_prompt="s",
            user_prompt="u",
            json_schema={"name": "x", "strict": True, "schema": {"type": "object"}},
            context=ctx,
            call_type="test",
        )
    assert exc_info.value.status_code == 502
    assert exc_info.value.error_code == "LLM_UPSTREAM_ERROR"


_MIN_SCHEMA: dict[str, Any] = {"name": "x", "strict": True, "schema": {"type": "object"}}


@pytest.mark.asyncio
async def test_chat_structured_rejects_json_schema_not_dict(
    db_session,
) -> None:
    llm = LLMService(db_session)
    ctx = TokenContext(
        studio_id=uuid.uuid4(),
        software_id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
    )
    bad_schema: Any = []
    with pytest.raises(ApiError) as exc_info:
        await llm.chat_structured(
            system_prompt="s",
            user_prompt="u",
            json_schema=bad_schema,
            context=ctx,
            call_type="test",
        )
    assert exc_info.value.error_code == "LLM_SCHEMA_INVALID"
    assert exc_info.value.status_code == 500


@pytest.mark.asyncio
async def test_chat_structured_rejects_json_schema_empty_name(
    db_session,
) -> None:
    llm = LLMService(db_session)
    ctx = TokenContext(
        studio_id=uuid.uuid4(),
        software_id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
    )
    with pytest.raises(ApiError) as exc_info:
        await llm.chat_structured(
            system_prompt="s",
            user_prompt="u",
            json_schema={"name": "  ", "strict": True, "schema": {"type": "object"}},
            context=ctx,
            call_type="test",
        )
    assert exc_info.value.error_code == "LLM_SCHEMA_INVALID"


@pytest.mark.asyncio
async def test_chat_structured_rejects_json_schema_strict_not_true(
    db_session,
) -> None:
    llm = LLMService(db_session)
    ctx = TokenContext(
        studio_id=uuid.uuid4(),
        software_id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
    )
    with pytest.raises(ApiError) as exc_info:
        await llm.chat_structured(
            system_prompt="s",
            user_prompt="u",
            json_schema={"name": "n", "strict": False, "schema": {"type": "object"}},
            context=ctx,
            call_type="test",
        )
    assert exc_info.value.error_code == "LLM_SCHEMA_INVALID"


@pytest.mark.asyncio
async def test_chat_structured_rejects_json_schema_inner_not_object(
    db_session,
) -> None:
    llm = LLMService(db_session)
    ctx = TokenContext(
        studio_id=uuid.uuid4(),
        software_id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
    )
    with pytest.raises(ApiError) as exc_info:
        await llm.chat_structured(
            system_prompt="s",
            user_prompt="u",
            json_schema={
                "name": "n",
                "strict": True,
                "schema": {"type": "array", "items": {"type": "string"}},
            },
            context=ctx,
            call_type="test",
        )
    assert exc_info.value.error_code == "LLM_SCHEMA_INVALID"


class _Upstream400SecretBodyResponse:
    status_code = 400
    headers = httpx.Headers({"x-request-id": "req-test-1"})
    text = '{"error": {"code": "bad", "type": "invalid", "message": "USER_SECRET_PROMPT"}}'

    def json(self) -> dict[str, Any]:
        return {}


class _Upstream400SecretBodyClient(_StructuredUpstreamErrPostClient):
    async def post(self, *args: object, **kwargs: object) -> object:
        return _Upstream400SecretBodyResponse()


@pytest.mark.asyncio
async def test_chat_structured_upstream_error_log_omits_raw_body(
    db_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.services import llm_service

    row = await db_session.get(AdminConfig, 1)
    assert row is not None
    row.llm_model = "gpt-test"
    row.llm_api_key = "sk-test"
    row.llm_provider = "openai"
    await db_session.flush()

    captured: list[tuple[str, dict[str, Any]]] = []

    def capture_warning(event: str, **kw: Any) -> None:
        captured.append((event, kw))

    monkeypatch.setattr(llm_service.log, "warning", capture_warning)
    monkeypatch.setattr(
        "app.services.llm_service.httpx.AsyncClient",
        _Upstream400SecretBodyClient,
    )

    llm = LLMService(db_session)
    ctx = TokenContext(
        studio_id=uuid.uuid4(),
        software_id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
    )
    with pytest.raises(ApiError):
        await llm.chat_structured(
            system_prompt="s",
            user_prompt="u",
            json_schema=_MIN_SCHEMA,
            context=ctx,
            call_type="test",
        )
    blob = str(captured)
    assert "USER_SECRET_PROMPT" not in blob
    assert any(
        rec[0] == "llm_http_error"
        and rec[1].get("upstream_error_code") == "bad"
        and rec[1].get("upstream_error_type") == "invalid"
        for rec in captured
    )


class _StructuredEmptyChoicesResponse:
    status_code = 200
    text = ""

    def json(self) -> dict:
        return {"choices": [], "usage": {}}


class _StructuredEmptyChoicesPostClient(_StructuredUpstreamErrPostClient):
    async def post(self, *args: object, **kwargs: object) -> object:
        return _StructuredEmptyChoicesResponse()


@pytest.mark.asyncio
async def test_chat_structured_empty_choices_maps_to_api_error(
    db_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    row = await db_session.get(AdminConfig, 1)
    assert row is not None
    row.llm_model = "gpt-test"
    row.llm_api_key = "sk-test"
    row.llm_provider = "openai"
    await db_session.flush()

    monkeypatch.setattr(
        "app.services.llm_service.httpx.AsyncClient",
        _StructuredEmptyChoicesPostClient,
    )

    llm = LLMService(db_session)
    ctx = TokenContext(
        studio_id=uuid.uuid4(),
        software_id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
    )
    with pytest.raises(ApiError) as exc_info:
        await llm.chat_structured(
            system_prompt="s",
            user_prompt="u",
            json_schema={"name": "x", "strict": True, "schema": {"type": "object"}},
            context=ctx,
            call_type="test",
        )
    assert exc_info.value.error_code == "LLM_EMPTY_RESPONSE"


class _StructuredBadJsonContentResponse:
    status_code = 200
    text = ""

    def json(self) -> dict:
        return {
            "choices": [{"message": {"content": "not valid json {"}}],
            "usage": {"prompt_tokens": 0, "completion_tokens": 0},
        }


class _StructuredBadJsonPostClient(_StructuredUpstreamErrPostClient):
    async def post(self, *args: object, **kwargs: object) -> object:
        return _StructuredBadJsonContentResponse()


@pytest.mark.asyncio
async def test_chat_structured_invalid_content_json_maps_to_api_error(
    db_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    row = await db_session.get(AdminConfig, 1)
    assert row is not None
    row.llm_model = "gpt-test"
    row.llm_api_key = "sk-test"
    row.llm_provider = "openai"
    await db_session.flush()

    monkeypatch.setattr(
        "app.services.llm_service.httpx.AsyncClient",
        _StructuredBadJsonPostClient,
    )

    llm = LLMService(db_session)
    ctx = TokenContext(
        studio_id=uuid.uuid4(),
        software_id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
    )
    with pytest.raises(ApiError) as exc_info:
        await llm.chat_structured(
            system_prompt="s",
            user_prompt="u",
            json_schema={"name": "x", "strict": True, "schema": {"type": "object"}},
            context=ctx,
            call_type="test",
        )
    assert exc_info.value.error_code == "LLM_INVALID_JSON"


class _StreamTimeoutCtx:
    async def __aenter__(self) -> None:
        raise httpx.ReadTimeout("timeout", request=None)

    async def __aexit__(self, *args: object) -> None:
        return None


class _StreamTimeoutClient:
    def __init__(self, *args: object, **kwargs: object) -> None:
        pass

    async def __aenter__(self) -> "_StreamTimeoutClient":
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    def stream(self, *args: object, **kwargs: object) -> _StreamTimeoutCtx:
        return _StreamTimeoutCtx()


@pytest.mark.asyncio
async def test_chat_stream_read_timeout_maps_to_api_error(
    db_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    row = await db_session.get(AdminConfig, 1)
    assert row is not None
    row.llm_model = "gpt-test"
    row.llm_api_key = "sk-test"
    row.llm_provider = "openai"
    await db_session.flush()

    monkeypatch.setattr(
        "app.services.llm_service.httpx.AsyncClient",
        _StreamTimeoutClient,
    )

    llm = LLMService(db_session)
    ctx = TokenContext(
        studio_id=uuid.uuid4(),
        software_id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
    )
    gen = llm.chat_stream(
        system_prompt="s",
        messages=[{"role": "user", "content": "hi"}],
        context=ctx,
        call_type="test",
    )
    with pytest.raises(ApiError) as exc_info:
        async for _ in gen:
            pass
    assert exc_info.value.error_code == "LLM_TIMEOUT"


class _StreamHttpErrResp:
    status_code = 429
    _body = b"rate limited"
    headers = httpx.Headers()

    async def aread(self) -> bytes:
        return self._body

    async def aiter_lines(self):
        if False:
            yield ""


class _StreamHttpErrClient:
    def __init__(self, *args: object, **kwargs: object) -> None:
        pass

    async def __aenter__(self) -> "_StreamHttpErrClient":
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    def stream(self, *args: object, **kwargs: object) -> "_StreamHttpErrCtx":
        return _StreamHttpErrCtx()


class _StreamHttpErrCtx:
    async def __aenter__(self) -> _StreamHttpErrResp:
        return _StreamHttpErrResp()

    async def __aexit__(self, *args: object) -> None:
        return None


@pytest.mark.asyncio
async def test_chat_stream_upstream_http_error_maps_to_api_error(
    db_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    row = await db_session.get(AdminConfig, 1)
    assert row is not None
    row.llm_model = "gpt-test"
    row.llm_api_key = "sk-test"
    row.llm_provider = "openai"
    await db_session.flush()

    monkeypatch.setattr(
        "app.services.llm_service.httpx.AsyncClient",
        _StreamHttpErrClient,
    )

    llm = LLMService(db_session)
    ctx = TokenContext(
        studio_id=uuid.uuid4(),
        software_id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
    )
    gen = llm.chat_stream(
        system_prompt="s",
        messages=[{"role": "user", "content": "hi"}],
        context=ctx,
        call_type="test",
    )
    with pytest.raises(ApiError) as exc_info:
        async for _ in gen:
            pass
    assert exc_info.value.error_code == "LLM_UPSTREAM_ERROR"


class _StreamHttpErrSecretResp:
    status_code = 400
    headers = httpx.Headers({"x-request-id": "stream-req"})
    _body = b'{"error": {"code": "x", "type": "y", "message": "USER_SECRET_PROMPT"}}'

    async def aread(self) -> bytes:
        return self._body

    async def aiter_lines(self):
        if False:
            yield ""


class _StreamHttpErrSecretClient:
    def __init__(self, *args: object, **kwargs: object) -> None:
        pass

    async def __aenter__(self) -> "_StreamHttpErrSecretClient":
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    def stream(self, *args: object, **kwargs: object) -> "_StreamHttpErrSecretCtx":
        return _StreamHttpErrSecretCtx()


class _StreamHttpErrSecretCtx:
    async def __aenter__(self) -> _StreamHttpErrSecretResp:
        return _StreamHttpErrSecretResp()

    async def __aexit__(self, *args: object) -> None:
        return None


@pytest.mark.asyncio
async def test_chat_stream_upstream_error_log_omits_raw_body(
    db_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.services import llm_service

    row = await db_session.get(AdminConfig, 1)
    assert row is not None
    row.llm_model = "gpt-test"
    row.llm_api_key = "sk-test"
    row.llm_provider = "openai"
    await db_session.flush()

    captured: list[tuple[str, dict[str, Any]]] = []

    def capture_warning(event: str, **kw: Any) -> None:
        captured.append((event, kw))

    monkeypatch.setattr(llm_service.log, "warning", capture_warning)
    monkeypatch.setattr(
        "app.services.llm_service.httpx.AsyncClient",
        _StreamHttpErrSecretClient,
    )

    llm = LLMService(db_session)
    ctx = TokenContext(
        studio_id=uuid.uuid4(),
        software_id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
    )
    gen = llm.chat_stream(
        system_prompt="s",
        messages=[{"role": "user", "content": "hi"}],
        context=ctx,
        call_type="test",
    )
    with pytest.raises(ApiError):
        async for _ in gen:
            pass
    assert "USER_SECRET_PROMPT" not in str(captured)
    assert any(
        rec[0] == "llm_stream_http_error"
        and rec[1].get("upstream_error_code") == "x"
        and rec[1].get("upstream_error_type") == "y"
        for rec in captured
    )


class _StreamHttpErrSecretResp:
    status_code = 400
    headers = httpx.Headers({"x-request-id": "stream-req"})
    _body = b'{"error": {"code": "x", "type": "y", "message": "USER_SECRET_PROMPT"}}'

    async def aread(self) -> bytes:
        return self._body

    async def aiter_lines(self):
        if False:
            yield ""


class _StreamHttpErrSecretClient:
    def __init__(self, *args: object, **kwargs: object) -> None:
        pass

    async def __aenter__(self) -> "_StreamHttpErrSecretClient":
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    def stream(self, *args: object, **kwargs: object) -> "_StreamHttpErrSecretCtx":
        return _StreamHttpErrSecretCtx()


class _StreamHttpErrSecretCtx:
    async def __aenter__(self) -> _StreamHttpErrSecretResp:
        return _StreamHttpErrSecretResp()

    async def __aexit__(self, *args: object) -> None:
        return None


@pytest.mark.asyncio
async def test_chat_stream_upstream_error_log_omits_raw_body(
    db_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.services import llm_service

    row = await db_session.get(AdminConfig, 1)
    assert row is not None
    row.llm_model = "gpt-test"
    row.llm_api_key = "sk-test"
    row.llm_provider = "openai"
    await db_session.flush()

    captured: list[tuple[str, dict[str, Any]]] = []

    def capture_warning(event: str, **kw: Any) -> None:
        captured.append((event, kw))

    monkeypatch.setattr(llm_service.log, "warning", capture_warning)
    monkeypatch.setattr(
        "app.services.llm_service.httpx.AsyncClient",
        _StreamHttpErrSecretClient,
    )

    llm = LLMService(db_session)
    ctx = TokenContext(
        studio_id=uuid.uuid4(),
        software_id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
    )
    gen = llm.chat_stream(
        system_prompt="s",
        messages=[{"role": "user", "content": "hi"}],
        context=ctx,
        call_type="test",
    )
    with pytest.raises(ApiError):
        async for _ in gen:
            pass
    assert "USER_SECRET_PROMPT" not in str(captured)
    assert any(
        rec[0] == "llm_stream_http_error"
        and rec[1].get("upstream_error_code") == "x"
        and rec[1].get("upstream_error_type") == "y"
        for rec in captured
    )
