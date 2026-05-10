"""Unit tests for deployment-only (registry) LLM model suggestions."""

from __future__ import annotations

import json

from types import SimpleNamespace

from app.services.llm_model_suggestions_service import collect_registry_suggestions


def _row(
    *,
    pk: str,
    models_json: str,
    slug: str | None = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        provider_id=pk,
        litellm_provider_slug=slug,
        models_json=models_json,
    )


def test_collect_registry_unions_all_providers() -> None:
    rows = [
        _row(pk="openai", models_json='["gpt-4o-mini"]'),
        _row(pk="moonshot", models_json='["moonshot/k2"]'),
    ]
    items, warnings = collect_registry_suggestions(
        rows,
        provider_id_filter=None,
        litellm_provider_filter=None,
        q=None,
        model_kind="chat",
    )
    assert {m.id for m in items} == {"gpt-4o-mini", "moonshot/k2"}
    by_id = {m.id: m.label for m in items}
    assert by_id["gpt-4o-mini"] == "gpt-4o-mini (openai)"
    assert by_id["moonshot/k2"] == "moonshot/k2 (moonshot)"
    assert not warnings
    assert all(m.source == "registry" for m in items)


def test_collect_registry_filters_by_litellm_slug() -> None:
    rows = [
        _row(pk="ms-local", slug="moonshot", models_json='["a"]'),
        _row(pk="other", slug="openai", models_json='["b"]'),
    ]
    items, _ = collect_registry_suggestions(
        rows,
        provider_id_filter=None,
        litellm_provider_filter="moonshot",
        q=None,
        model_kind="chat",
    )
    assert [m.id for m in items] == ["a"]


def test_collect_registry_filters_by_provider_id() -> None:
    rows = [
        _row(pk="alpha", models_json='["x"]'),
        _row(pk="beta", models_json='["y"]'),
    ]
    items, _ = collect_registry_suggestions(
        rows,
        provider_id_filter="beta",
        litellm_provider_filter=None,
        q=None,
        model_kind="chat",
    )
    assert [m.id for m in items] == ["y"]


def test_collect_registry_query_substring() -> None:
    rows = [_row(pk="p", models_json='["gpt-4o-mini", "other"]')]
    items, _ = collect_registry_suggestions(
        rows,
        provider_id_filter=None,
        litellm_provider_filter=None,
        q="gpt",
        model_kind="chat",
    )
    assert [m.id for m in items] == ["gpt-4o-mini"]


def test_collect_registry_warns_duplicate_ids_across_providers() -> None:
    rows = [
        _row(pk="p1", models_json='["shared-id"]'),
        _row(pk="p2", models_json='["shared-id"]'),
    ]
    items, warnings = collect_registry_suggestions(
        rows,
        provider_id_filter=None,
        litellm_provider_filter=None,
        q=None,
        model_kind="chat",
    )
    assert len(items) == 1
    assert items[0].id == "shared-id"
    assert items[0].label == "shared-id (p1, p2)"
    assert items[0].provider is None
    assert any("multiple registry providers" in w for w in warnings)


def test_collect_registry_filters_embedding_kind() -> None:
    rows = [
        _row(
            pk="openai",
            models_json=json.dumps(
                [
                    {"id": "gpt-4o-mini", "kind": "chat"},
                    {"id": "text-embedding-3-small", "kind": "embedding"},
                ]
            ),
        ),
    ]
    chat_items, _ = collect_registry_suggestions(
        rows,
        provider_id_filter=None,
        litellm_provider_filter=None,
        q=None,
        model_kind="chat",
    )
    emb_items, _ = collect_registry_suggestions(
        rows,
        provider_id_filter=None,
        litellm_provider_filter=None,
        q=None,
        model_kind="embedding",
    )
    assert [m.id for m in chat_items] == ["gpt-4o-mini"]
    assert [m.id for m in emb_items] == ["text-embedding-3-small"]


def test_collect_registry_warns_when_slug_filter_matches_no_row() -> None:
    rows = [_row(pk="only", models_json='["z"]')]
    items, warnings = collect_registry_suggestions(
        rows,
        provider_id_filter=None,
        litellm_provider_filter="missing",
        q=None,
        model_kind="chat",
    )
    assert not items
    assert warnings and "No registry provider matched" in warnings[0]
