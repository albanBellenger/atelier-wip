"""Embedding HTTP client maps transport failures to ApiError."""

import uuid

import httpx
import pytest

from app.exceptions import ApiError
from app.models import AdminConfig
from app.services.embedding_service import EmbeddingService


class _EmbedTimeoutClient:
    def __init__(self, *args: object, **kwargs: object) -> None:
        pass

    async def __aenter__(self) -> "_EmbedTimeoutClient":
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    async def post(self, *args: object, **kwargs: object) -> object:
        raise httpx.ReadTimeout("timeout", request=None)


class _EmbedConnectClient:
    def __init__(self, *args: object, **kwargs: object) -> None:
        pass

    async def __aenter__(self) -> "_EmbedConnectClient":
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    async def post(self, *args: object, **kwargs: object) -> object:
        raise httpx.ConnectError("refused", request=None)


@pytest.mark.asyncio
async def test_embed_batch_read_timeout_maps_to_embedding_timeout(
    db_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    row = await db_session.get(AdminConfig, 1)
    if row is None:
        row = AdminConfig(id=1)
        db_session.add(row)
        await db_session.flush()
    row.embedding_model = "m"
    row.embedding_api_key = "k"
    row.embedding_provider = "openai"
    await db_session.flush()

    monkeypatch.setattr(
        "app.services.embedding_service.httpx.AsyncClient",
        _EmbedTimeoutClient,
    )
    svc = EmbeddingService(db_session)
    with pytest.raises(ApiError) as e:
        await svc.embed_batch(["hello"])
    assert e.value.error_code == "EMBEDDING_TIMEOUT"
    assert e.value.status_code == 504


@pytest.mark.asyncio
async def test_embed_batch_connect_error_maps_to_transport(
    db_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    row = await db_session.get(AdminConfig, 1)
    assert row is not None
    row.embedding_model = "m"
    row.embedding_api_key = "k"
    row.embedding_provider = "openai"
    await db_session.flush()

    monkeypatch.setattr(
        "app.services.embedding_service.httpx.AsyncClient",
        _EmbedConnectClient,
    )
    svc = EmbeddingService(db_session)
    with pytest.raises(ApiError) as e:
        await svc.embed_batch(["hello"])
    assert e.value.error_code == "EMBEDDING_TRANSPORT_ERROR"
    assert e.value.status_code == 502
