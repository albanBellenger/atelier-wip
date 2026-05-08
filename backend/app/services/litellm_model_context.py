"""LiteLLM catalog helpers for model context limits."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import litellm

from app.models import LlmProviderRegistry
from app.schemas.llm_registry_model import LlmRegistryModelEntry
from app.services.litellm_model_id import normalize_litellm_chat_model


def extract_context_limit(info: dict[str, Any]) -> int | None:
    """Best-effort context / input token limit from ``litellm.get_model_info``-style dicts."""
    for key in ("max_input_tokens", "input_token_limit"):
        v = info.get(key)
        if isinstance(v, int) and v > 0:
            return v
    v = info.get("max_tokens")
    if isinstance(v, int) and v > 0:
        return v
    return None


def fetch_litellm_context_for_model_id(
    bare_model_id: str,
    *,
    draft_registry_row: LlmProviderRegistry,
) -> tuple[int | None, bool]:
    """Return ``(max_context_tokens, lookup_succeeded)`` using LiteLLM model catalog.

    ``lookup_succeeded`` is False when ``get_model_info`` raises or returns no limit.
    """
    litellm_id = normalize_litellm_chat_model(bare_model_id, registry_row=draft_registry_row)
    try:
        raw = litellm.get_model_info(model=litellm_id)
    except Exception:
        return None, False
    if not isinstance(raw, dict):
        return None, False
    limit = extract_context_limit(raw)
    if limit is None:
        return None, False
    return limit, True


def enrich_model_entries_from_litellm(
    entries: list[LlmRegistryModelEntry],
    *,
    draft_registry_row: LlmProviderRegistry,
) -> list[LlmRegistryModelEntry]:
    """Fill context metadata from LiteLLM unless the row is explicitly manual with a limit."""
    now = datetime.now(timezone.utc)
    out: list[LlmRegistryModelEntry] = []
    for e in entries:
        if (
            e.context_metadata_source == "manual"
            and e.max_context_tokens is not None
            and e.max_context_tokens > 0
        ):
            out.append(e.model_copy())
            continue
        tokens, ok = fetch_litellm_context_for_model_id(e.id, draft_registry_row=draft_registry_row)
        if ok and tokens is not None:
            out.append(
                LlmRegistryModelEntry(
                    id=e.id,
                    max_context_tokens=tokens,
                    context_metadata_source="litellm",
                    context_metadata_checked_at=now,
                )
            )
        else:
            out.append(e.model_copy())
    return out
