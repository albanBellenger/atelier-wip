"""Pydantic schemas for admin LLM registry requests."""

from __future__ import annotations

from app.schemas.admin_console import LlmProviderRegistryUpdate


def test_llm_provider_registry_update_coerces_legacy_string_models() -> None:
    body = LlmProviderRegistryUpdate.model_validate(
        {
            "display_name": "OpenAI",
            "models": ["gpt-4o-mini", "gpt-4o"],
        }
    )
    assert [m.id for m in body.models] == ["gpt-4o-mini", "gpt-4o"]
    assert all(m.context_metadata_source == "unknown" for m in body.models)
