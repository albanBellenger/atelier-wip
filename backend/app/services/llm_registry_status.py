"""Normalize ``llm_provider_registry.status`` for comparisons."""

from __future__ import annotations

from app.models import LlmProviderRegistry


def normalize_llm_registry_status(value: str | None) -> str:
    return (value or "").strip().lower()


def llm_registry_row_is_connected(row: LlmProviderRegistry) -> bool:
    return normalize_llm_registry_status(row.status) == "connected"
