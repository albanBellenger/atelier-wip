"""Normalize model ids for LiteLLM (provider prefix when registry-backed)."""

from __future__ import annotations

from app.models import LlmProviderRegistry


def normalize_litellm_chat_model(
    model: str, *, registry_row: LlmProviderRegistry | None
) -> str:
    """Return a LiteLLM ``model`` string.

    If ``model`` already contains ``/``, it is returned unchanged (admin set ``provider/model``).
    If ``registry_row`` is set and the model has no slash, prefix with
    ``litellm_provider_slug`` when non-empty, else ``provider_key``.
    With no registry row, the model is unchanged (cannot infer provider safely).
    """
    m = (model or "").strip()
    if not m or "/" in m:
        return m
    if registry_row is None:
        return m
    slug = (getattr(registry_row, "litellm_provider_slug", None) or "").strip()
    if not slug:
        slug = (registry_row.provider_key or "").strip()
    if not slug:
        return m
    return f"{slug}/{m}"


def normalize_litellm_embedding_model(
    model: str,
    *,
    litellm_provider_slug: str | None,
    provider_name_fallback: str,
) -> str:
    """Prefix embedding ``model_id`` for LiteLLM when unqualified and slug/fallback exists."""
    m = (model or "").strip()
    if not m or "/" in m:
        return m
    slug = (litellm_provider_slug or "").strip()
    if not slug:
        slug = (provider_name_fallback or "").strip().lower()
    if not slug:
        return m
    return f"{slug}/{m}"
