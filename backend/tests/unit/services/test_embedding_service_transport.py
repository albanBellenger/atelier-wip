"""Embedding LiteLLM client maps transport failures to ApiError."""

from __future__ import annotations

from unittest.mock import AsyncMock

import httpx
import pytest
from openai import APIConnectionError, APITimeoutError

import uuid

from app.exceptions import ApiError
from app.models import AdminConfig, EmbeddingModelRegistry
from app.services.embedding_service import EmbeddingService

_REQ = httpx.Request("POST", "https://example.test/v1/embeddings")


@pytest.mark.asyncio
async def test_embed_batch_read_timeout_maps_to_embedding_timeout(
    db_session: object,
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
        "app.services.embedding_service.litellm.aembedding",
        AsyncMock(side_effect=APITimeoutError(request=_REQ)),
    )
    svc = EmbeddingService(db_session)
    with pytest.raises(ApiError) as e:
        await svc.embed_batch(["hello"])
    assert e.value.error_code == "EMBEDDING_TIMEOUT"
    assert e.value.status_code == 504


@pytest.mark.asyncio
async def test_embed_batch_connect_error_maps_to_transport(
    db_session: object,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    row = await db_session.get(AdminConfig, 1)
    assert row is not None
    row.embedding_model = "m"
    row.embedding_api_key = "k"
    row.embedding_provider = "openai"
    await db_session.flush()

    monkeypatch.setattr(
        "app.services.embedding_service.litellm.aembedding",
        AsyncMock(side_effect=APIConnectionError(message="refused", request=_REQ)),
    )
    svc = EmbeddingService(db_session)
    with pytest.raises(ApiError) as e:
        await svc.embed_batch(["hello"])
    assert e.value.error_code == "EMBEDDING_TRANSPORT_ERROR"
    assert e.value.status_code == 502


@pytest.mark.asyncio
async def test_require_embedding_ready_prefixes_from_registry_default(
    db_session: object,
) -> None:
    row = await db_session.get(AdminConfig, 1)
    if row is None:
        row = AdminConfig(id=1)
        db_session.add(row)
        await db_session.flush()
    row.embedding_api_key = "k"
    row.embedding_provider = "openai"
    row.embedding_model = "ignored-when-registry-default"
    db_session.add(
        EmbeddingModelRegistry(
            id=uuid.uuid4(),
            model_id="text-embedding-3-small",
            provider_name="OpenAI",
            dim=1536,
            default_role="default",
            litellm_provider_slug="openai",
        )
    )
    await db_session.flush()
    svc = EmbeddingService(db_session)
    model, *_rest = await svc.require_embedding_ready()
    assert model == "openai/text-embedding-3-small"


@pytest.mark.asyncio
async def test_require_embedding_ready_admin_config_prefixes_with_provider(
    db_session: object,
) -> None:
    row = await db_session.get(AdminConfig, 1)
    if row is None:
        row = AdminConfig(id=1)
        db_session.add(row)
        await db_session.flush()
    row.embedding_model = "text-embedding-3-small"
    row.embedding_api_key = "k"
    row.embedding_provider = "openai"
    await db_session.flush()
    svc = EmbeddingService(db_session)
    model, *_rest = await svc.require_embedding_ready()
    assert model == "openai/text-embedding-3-small"
