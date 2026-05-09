"""Embedding LiteLLM client maps transport failures to ApiError."""

from __future__ import annotations

import json
import uuid
from unittest.mock import AsyncMock

import httpx
import pytest
from openai import APIConnectionError, APITimeoutError

from app.exceptions import ApiError
from app.models import LlmProviderRegistry, LlmRoutingRule
from app.services.embedding_service import EmbeddingService

_REQ = httpx.Request("POST", "https://example.test/v1/embeddings")


async def _seed_embedding_via_llm_registry(db_session: object) -> None:
    db_session.add(
        LlmProviderRegistry(
            id=uuid.uuid4(),
            provider_key="openai",
            display_name="OpenAI",
            models_json=json.dumps(["text-embedding-3-small"]),
            status="connected",
            is_default=True,
            sort_order=0,
            api_key="sk-test",
            litellm_provider_slug="openai",
        )
    )
    db_session.add(
        LlmRoutingRule(
            use_case="embeddings",
            primary_model="text-embedding-3-small",
            fallback_model=None,
        )
    )
    await db_session.flush()


@pytest.mark.asyncio
async def test_embed_batch_read_timeout_maps_to_embedding_timeout(
    db_session: object,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _seed_embedding_via_llm_registry(db_session)

    monkeypatch.setattr(
        "app.services.embedding_service.litellm.aembedding",
        AsyncMock(side_effect=APITimeoutError(request=_REQ)),
    )
    svc = EmbeddingService(db_session)
    with pytest.raises(ApiError) as e:
        await svc.embed_batch(["hello"], studio_id=None)
    assert e.value.error_code == "EMBEDDING_TIMEOUT"
    assert e.value.status_code == 504


@pytest.mark.asyncio
async def test_embed_batch_connect_error_maps_to_transport(
    db_session: object,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _seed_embedding_via_llm_registry(db_session)

    monkeypatch.setattr(
        "app.services.embedding_service.litellm.aembedding",
        AsyncMock(side_effect=APIConnectionError(message="refused", request=_REQ)),
    )
    svc = EmbeddingService(db_session)
    with pytest.raises(ApiError) as e:
        await svc.embed_batch(["hello"], studio_id=None)
    assert e.value.error_code == "EMBEDDING_TRANSPORT_ERROR"
    assert e.value.status_code == 502


@pytest.mark.asyncio
async def test_require_embedding_ready_prefixes_litellm_slug(
    db_session: object,
) -> None:
    await _seed_embedding_via_llm_registry(db_session)
    svc = EmbeddingService(db_session)
    model, *_rest = await svc.require_embedding_ready(None)
    assert model == "openai/text-embedding-3-small"
