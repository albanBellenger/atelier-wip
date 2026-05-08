"""Unit tests for ``registry_models_json`` parsing and matching."""

from __future__ import annotations

import json

import pytest

from app.models import LlmProviderRegistry
from app.schemas.llm_registry_model import LlmRegistryModelEntry
from app.services.registry_models_json import (
    entry_for_litellm_model,
    model_ids_from_json,
    parse_models_json,
    serialize_models_json,
)


def test_parse_legacy_string_list() -> None:
    raw = json.dumps(["a", "b"])
    got = parse_models_json(raw)
    assert [e.id for e in got] == ["a", "b"]
    assert all(e.context_metadata_source == "unknown" for e in got)


def test_parse_rich_entries_round_trip() -> None:
    entries = [
        LlmRegistryModelEntry(
            id="gpt-4o",
            max_context_tokens=128_000,
            context_metadata_source="litellm",
        )
    ]
    s = serialize_models_json(entries)
    back = parse_models_json(s)
    assert len(back) == 1
    assert back[0].id == "gpt-4o"
    assert back[0].max_context_tokens == 128_000
    assert back[0].context_metadata_source == "litellm"


def test_model_ids_from_json() -> None:
    assert model_ids_from_json(json.dumps([{"id": "x", "max_context_tokens": 1}])) == ["x"]


def test_entry_for_litellm_model_matches_prefix() -> None:
    row = LlmProviderRegistry(
        provider_key="openai",
        litellm_provider_slug="openai",
        display_name="",
        models_json="[]",
        api_base_url=None,
        logo_url=None,
        status="connected",
        is_default=False,
        sort_order=0,
        api_key=None,
    )
    entries = [LlmRegistryModelEntry(id="gpt-4o-mini")]
    hit = entry_for_litellm_model(
        entries=entries, litellm_model="openai/gpt-4o-mini", registry_row=row
    )
    assert hit is not None
    assert hit.id == "gpt-4o-mini"
