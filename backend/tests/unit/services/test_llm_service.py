"""LLM client behavior (timeouts → ApiError)."""

import uuid

import httpx
import pytest

from app.exceptions import ApiError
from app.models import AdminConfig
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
