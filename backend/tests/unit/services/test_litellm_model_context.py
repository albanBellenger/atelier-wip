"""Unit tests for LiteLLM model context extraction."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from app.models import LlmProviderRegistry
from app.schemas.llm_registry_model import LlmRegistryModelEntry
from app.services.litellm_model_context import (
    enrich_model_entries_from_litellm,
    extract_context_limit,
    fetch_litellm_context_for_model_id,
)


@pytest.mark.parametrize(
    ("info", "want"),
    [
        ({"max_input_tokens": 8192}, 8192),
        ({"input_token_limit": 4096}, 4096),
        ({"max_tokens": 16000}, 16000),
        ({}, None),
        ({"max_input_tokens": 100_000, "max_output_tokens": 8192}, 100_000),
    ],
)
def test_extract_context_limit(info: dict, want: int | None) -> None:
    assert extract_context_limit(info) == want


def test_fetch_litellm_context_handles_exception() -> None:
    row = LlmProviderRegistry(
        provider_id="openai",
        litellm_provider_slug="openai",
        models_json="[]",
        api_base_url=None,
        logo_url=None,
        status="connected",
        is_default=False,
        sort_order=0,
        api_key=None,
    )
    with patch(
        "app.services.litellm_model_context.litellm.get_model_info",
        side_effect=RuntimeError("x"),
    ):
        t, ok = fetch_litellm_context_for_model_id("unknown-model-xyz", draft_registry_row=row)
    assert t is None
    assert ok is False


def test_enrich_respects_manual_with_limit() -> None:
    row = LlmProviderRegistry(
        provider_id="openai",
        litellm_provider_slug="openai",
        models_json="[]",
        api_base_url=None,
        logo_url=None,
        status="connected",
        is_default=False,
        sort_order=0,
        api_key=None,
    )
    manual = LlmRegistryModelEntry(
        id="custom",
        max_context_tokens=50_000,
        context_metadata_source="manual",
    )
    with patch(
        "app.services.litellm_model_context.fetch_litellm_context_for_model_id",
        return_value=(99_999, True),
    ) as fetch:
        out = enrich_model_entries_from_litellm([manual], draft_registry_row=row)
    fetch.assert_not_called()
    assert out[0].max_context_tokens == 50_000
    assert out[0].context_metadata_source == "manual"


def test_enrich_preserves_embedding_kind_and_skips_catalog() -> None:
    row = LlmProviderRegistry(
        provider_id="openai",
        litellm_provider_slug="openai",
        models_json="[]",
        api_base_url=None,
        logo_url=None,
        status="connected",
        is_default=False,
        sort_order=0,
        api_key=None,
    )
    emb = LlmRegistryModelEntry(id="text-embedding-3-small", kind="embedding")
    with patch(
        "app.services.litellm_model_context.fetch_litellm_context_for_model_id",
    ) as fetch:
        out = enrich_model_entries_from_litellm([emb], draft_registry_row=row)
    fetch.assert_not_called()
    assert len(out) == 1
    assert out[0].id == "text-embedding-3-small"
    assert out[0].kind == "embedding"
