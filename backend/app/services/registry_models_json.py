"""Parse and serialize ``LlmProviderRegistry.models_json`` (legacy string list or rich entries)."""

from __future__ import annotations

import json
from typing import Any

from pydantic import ValidationError

from app.models import LlmProviderRegistry
from app.schemas.llm_registry_model import LlmRegistryModelEntry, LlmRegistryModelKind
from app.services.litellm_model_id import normalize_litellm_chat_model


def parse_models_json(raw: str | None) -> list[LlmRegistryModelEntry]:
    """Accept legacy JSON list of strings or list of objects."""
    try:
        data = json.loads(raw or "[]")
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []
    out: list[LlmRegistryModelEntry] = []
    for item in data:
        if isinstance(item, str) and item.strip():
            out.append(LlmRegistryModelEntry.from_legacy_string(item))
            continue
        if not isinstance(item, dict):
            continue
        try:
            out.append(LlmRegistryModelEntry.model_validate(item))
        except ValidationError:
            mid = str(item.get("id") or "").strip()
            if mid:
                out.append(LlmRegistryModelEntry.from_legacy_string(mid))
    return out


def model_ids_from_json(raw: str | None) -> list[str]:
    return [e.id for e in parse_models_json(raw)]


def model_ids_for_kind(raw: str | None, kind: LlmRegistryModelKind) -> list[str]:
    return [e.id for e in parse_models_json(raw) if e.kind == kind]


def first_model_id_for_kind(raw: str | None, kind: LlmRegistryModelKind) -> str | None:
    for e in parse_models_json(raw):
        if e.kind == kind:
            return e.id
    return None


def serialize_models_json(entries: list[LlmRegistryModelEntry]) -> str:
    payload: list[dict[str, Any]] = []
    for e in entries:
        payload.append(e.model_dump(mode="json", exclude_none=False))
    return json.dumps(payload)


def first_model_id_from_json(raw: str | None) -> str | None:
    """First model id in stored order (any ``kind``)."""
    entries = parse_models_json(raw)
    return entries[0].id if entries else None


def entry_for_litellm_model(
    *,
    entries: list[LlmRegistryModelEntry],
    litellm_model: str,
    registry_row: LlmProviderRegistry,
) -> LlmRegistryModelEntry | None:
    """Match ``litellm_model`` (already provider-prefixed when applicable) to a stored entry ``id``."""
    target = (litellm_model or "").strip()
    if not target:
        return None
    for e in entries:
        if e.kind != "chat":
            continue
        if normalize_litellm_chat_model(e.id, registry_row=registry_row) == target:
            return e
    return None
