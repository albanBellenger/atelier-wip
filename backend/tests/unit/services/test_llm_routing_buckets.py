"""Unit tests for canonical LLM routing bucket mapping."""

import pytest

from app.services.llm_routing_buckets import (
    ROUTING_BUCKET_ORDER,
    build_llm_routing_buckets_response,
    use_case_for_call_source,
)


@pytest.mark.parametrize(
    "call_source,expected",
    [
        ("", "chat"),
        ("chat", "chat"),
        ("CHAT", "chat"),
        ("work_order_gen", "code_gen"),
        ("mcp_wo", "code_gen"),
        ("drift", "classification"),
        ("section_drift", "classification"),
        ("embedding", "embeddings"),
        ("aembedding", "embeddings"),
        ("foo_embed_bar", "embeddings"),
        ("unknown_new_agent", "chat"),
    ],
)
def test_use_case_for_call_source_parametrized(call_source: str, expected: str) -> None:
    assert use_case_for_call_source(call_source) == expected


def test_inventory_call_sources_match_routing_rules() -> None:
    """Every listed call_source must resolve to its bucket's use_case."""
    out = build_llm_routing_buckets_response()
    assert out.bucket_order == list(ROUTING_BUCKET_ORDER)
    assert len(out.buckets) == len(ROUTING_BUCKET_ORDER)
    by_uc = {b.use_case: b for b in out.buckets}
    assert set(by_uc) == set(ROUTING_BUCKET_ORDER)
    for row in out.buckets:
        for cs in row.call_sources:
            assert use_case_for_call_source(cs) == row.use_case, (cs, row.use_case)


def test_build_llm_routing_buckets_response_metadata() -> None:
    out = build_llm_routing_buckets_response()
    assert out.embeddings_match == "substring"
    assert out.embeddings_substring == "embed"
    assert "embed" in out.embeddings_routing_note
    assert len(out.chat_default_note) > 10
