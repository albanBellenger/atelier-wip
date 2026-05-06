"""Unit tests for LLM model suggestion JSON parsers."""

from __future__ import annotations

from app.services.llm_model_suggestions_service import (
    normalize_catalog_model_id,
    parse_catalog_body,
    parse_openai_v1_models_body,
)


def test_parse_openai_v1_models_skips_garbage() -> None:
    assert parse_openai_v1_models_body(None) == []
    assert parse_openai_v1_models_body([]) == []
    assert parse_openai_v1_models_body({"data": "x"}) == []


def test_parse_openai_v1_models_maps_rows() -> None:
    body = {"data": [{"id": "gpt-4o-mini"}, {"object": "model", "id": "  "}]}
    out = parse_openai_v1_models_body(body)
    assert len(out) == 1
    assert out[0].id == "gpt-4o-mini"
    assert out[0].source == "upstream"


def test_normalize_catalog_prefixed_id_unchanged() -> None:
    assert (
        normalize_catalog_model_id({"id": "moonshot/kimi-k2.5", "provider": "moonshot"})
        == "moonshot/kimi-k2.5"
    )


def test_normalize_catalog_prefixes_bare_id() -> None:
    assert (
        normalize_catalog_model_id({"id": "text-embedding-3-small", "provider": "openai"})
        == "openai/text-embedding-3-small"
    )


def test_parse_catalog_body() -> None:
    body = {
        "data": [
            {"id": "moonshot/kimi-k2.5", "provider": "moonshot", "mode": "chat"},
            {"id": "gpt-4o", "provider": "openai", "mode": "chat"},
        ]
    }
    out = parse_catalog_body(body)
    assert {x.id for x in out} == {"moonshot/kimi-k2.5", "openai/gpt-4o"}
    assert all(x.source == "catalog" for x in out)
