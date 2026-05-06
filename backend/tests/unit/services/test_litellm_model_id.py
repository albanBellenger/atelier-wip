"""Unit tests for LiteLLM model id normalization."""

from __future__ import annotations

import uuid

from app.models import LlmProviderRegistry
from app.services.litellm_model_id import (
    normalize_litellm_chat_model,
    normalize_litellm_embedding_model,
)


def _reg(
    *,
    provider_key: str = "moonshot",
    litellm_provider_slug: str | None = None,
) -> LlmProviderRegistry:
    return LlmProviderRegistry(
        id=uuid.uuid4(),
        provider_key=provider_key,
        display_name="X",
        models_json='["m"]',
        api_base_url=None,
        logo_url=None,
        status="connected",
        is_default=False,
        sort_order=0,
        api_key=None,
        litellm_provider_slug=litellm_provider_slug,
    )


def test_chat_no_registry_unchanged() -> None:
    assert normalize_litellm_chat_model("kimi-x", registry_row=None) == "kimi-x"


def test_chat_already_prefixed_unchanged() -> None:
    r = _reg()
    assert normalize_litellm_chat_model("moonshot/kimi-x", registry_row=r) == "moonshot/kimi-x"


def test_chat_registry_prefixes_with_provider_key() -> None:
    r = _reg(provider_key="moonshot")
    assert normalize_litellm_chat_model("kimi-k2-0905-preview", registry_row=r) == (
        "moonshot/kimi-k2-0905-preview"
    )


def test_chat_slug_overrides_provider_key() -> None:
    r = _reg(provider_key="my_kimi", litellm_provider_slug="moonshot")
    assert normalize_litellm_chat_model("kimi-x", registry_row=r) == "moonshot/kimi-x"


def test_chat_slug_whitespace_trimmed() -> None:
    r = _reg(provider_key="p", litellm_provider_slug="  openai  ")
    assert normalize_litellm_chat_model("gpt-4o-mini", registry_row=r) == "openai/gpt-4o-mini"


def test_embedding_no_prefix_without_slug() -> None:
    assert (
        normalize_litellm_embedding_model("text-embedding-3-small", litellm_provider_slug=None, provider_name_fallback="")
        == "text-embedding-3-small"
    )


def test_embedding_prefixes_with_slug() -> None:
    assert (
        normalize_litellm_embedding_model(
            "text-embedding-3-small",
            litellm_provider_slug="openai",
            provider_name_fallback="ignored",
        )
        == "openai/text-embedding-3-small"
    )


def test_embedding_fallback_provider_name() -> None:
    assert (
        normalize_litellm_embedding_model(
            "text-embedding-3-small",
            litellm_provider_slug=None,
            provider_name_fallback="OpenAI",
        )
        == "openai/text-embedding-3-small"
    )


def test_embedding_already_prefixed() -> None:
    assert (
        normalize_litellm_embedding_model(
            "openai/foo",
            litellm_provider_slug="azure",
            provider_name_fallback="x",
        )
        == "openai/foo"
    )
