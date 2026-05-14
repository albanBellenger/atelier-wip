"""Regression: OpenAI-compatible base URL normalization (LLM + embeddings)."""

from app.openai_compat_urls import (
    DEFAULT_OPENAI_V1_BASE,
    chat_completions_url,
    embeddings_url,
    openai_v1_base,
)


def test_openai_v1_base_defaults_when_none_or_blank() -> None:
    assert openai_v1_base(None) == DEFAULT_OPENAI_V1_BASE
    assert openai_v1_base("") == DEFAULT_OPENAI_V1_BASE
    assert openai_v1_base("   ") == DEFAULT_OPENAI_V1_BASE


def test_openai_v1_base_trims_and_strips_trailing_slash() -> None:
    assert openai_v1_base("  https://litellm.example/v1/  ") == "https://litellm.example/v1"


def test_chat_completions_and_embeddings_urls_join_paths() -> None:
    base = "https://gateway.test/v1"
    assert chat_completions_url(base) == "https://gateway.test/v1/chat/completions"
    assert embeddings_url(base) == "https://gateway.test/v1/embeddings"


def test_chat_completions_url_handles_none_base() -> None:
    assert chat_completions_url(None) == f"{DEFAULT_OPENAI_V1_BASE}/chat/completions"
