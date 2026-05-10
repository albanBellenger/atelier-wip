"""Normalize model ids for LiteLLM (provider prefix when registry-backed)."""

from __future__ import annotations

from app.models import LlmProviderRegistry


def _normalize_litellm_model(
    model: str,
    *,
    litellm_provider_slug: str | None,
    provider_id_fallback: str,
    lowercase_provider_id_fallback: bool,
) -> str:
    """Shared prefix logic: slug from ``litellm_provider_slug``, else provider id fallback."""
    m = (model or "").strip()
    if not m or "/" in m:
        return m
    slug = (litellm_provider_slug or "").strip()
    if not slug:
        raw = (provider_id_fallback or "").strip()
        slug = raw.lower() if lowercase_provider_id_fallback else raw
    if not slug:
        return m
    return f"{slug}/{m}"


def normalize_litellm_chat_model(
    model: str, *, registry_row: LlmProviderRegistry | None
) -> str:
    """Return a LiteLLM ``model`` string.

    If ``model`` already contains ``/``, it is returned unchanged (admin set ``provider/model``).
    If ``registry_row`` is set and the model has no slash, prefix with
    ``litellm_provider_slug`` when non-empty, else ``provider_id``.
    With no registry row, the model is unchanged (cannot infer provider safely).
    """
    m = (model or "").strip()
    if not m or "/" in m:
        return m
    if registry_row is None:
        return m
    slug_attr = getattr(registry_row, "litellm_provider_slug", None)
    return _normalize_litellm_model(
        m,
        litellm_provider_slug=slug_attr,
        provider_id_fallback=registry_row.provider_id or "",
        lowercase_provider_id_fallback=False,
    )


def normalize_litellm_embedding_model(
    model: str,
    *,
    litellm_provider_slug: str | None,
    provider_name_fallback: str,
) -> str:
    """Prefix embedding ``model_id`` for LiteLLM when unqualified and slug/fallback exists."""
    return _normalize_litellm_model(
        model,
        litellm_provider_slug=litellm_provider_slug,
        provider_id_fallback=provider_name_fallback,
        lowercase_provider_id_fallback=True,
    )
