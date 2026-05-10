"""Canonical LLM routing bucket keys and token_usage.call_source → use_case mapping."""

from __future__ import annotations

from typing import Final

from app.schemas.admin_console import (
    LlmRoutingBucketInventoryRow,
    LlmRoutingBucketsResponse,
)

# Display / API order (matches admin UI agent groups).
ROUTING_BUCKET_ORDER: Final[tuple[str, ...]] = (
    "chat",
    "code_gen",
    "classification",
    "embeddings",
)

_CODE_GEN_SOURCES: Final[frozenset[str]] = frozenset(
    {
        "mcp",
        "mcp_wo",
        "work_order",
        "work_order_dedupe",
        "work_order_gen",
    }
)

_CLASSIFICATION_SOURCES: Final[frozenset[str]] = frozenset({"drift", "section_drift"})

# Representative chat agents (inventory). Any call_source not matched below defaults to chat.
_CHAT_KNOWN_SOURCES: Final[tuple[str, ...]] = (
    "admin_connectivity_probe",
    "builder_composer_hint",
    "chat",
    "citation_health",
    "conflict",
    "graph",
    "private_thread",
    "rag_software_definition_summary",
    "section_improve",
    "thread",
    "thread_conflict_scan",
    "thread_patch_append",
    "thread_patch_edit",
    "thread_patch_replace",
)

# Examples whose lowercase form contains EMBEDDINGS_SUBSTRING (routing uses substring, not this list).
_EMBEDDINGS_EXAMPLE_SOURCES: Final[tuple[str, ...]] = ("aembedding", "embedding")

EMBEDDINGS_SUBSTRING: Final[str] = "embed"


def use_case_for_call_source(call_source: str) -> str:
    """Map token_usage.call_source to a routing use_case key."""
    ct = (call_source or "chat").lower()
    if ct in _CODE_GEN_SOURCES:
        return "code_gen"
    if ct in _CLASSIFICATION_SOURCES:
        return "classification"
    if EMBEDDINGS_SUBSTRING in ct:
        return "embeddings"
    return "chat"


def build_llm_routing_buckets_response() -> LlmRoutingBucketsResponse:
    """Payload for GET /admin/llm/routing/buckets (platform admin)."""
    rows: list[LlmRoutingBucketInventoryRow] = []
    for uc in ROUTING_BUCKET_ORDER:
        if uc == "chat":
            sources = list(_CHAT_KNOWN_SOURCES)
        elif uc == "code_gen":
            sources = sorted(_CODE_GEN_SOURCES)
        elif uc == "classification":
            sources = sorted(_CLASSIFICATION_SOURCES)
        else:
            sources = list(_EMBEDDINGS_EXAMPLE_SOURCES)
        rows.append(LlmRoutingBucketInventoryRow(use_case=uc, call_sources=sources))
    return LlmRoutingBucketsResponse(
        bucket_order=list(ROUTING_BUCKET_ORDER),
        buckets=rows,
        embeddings_match="substring",
        embeddings_substring=EMBEDDINGS_SUBSTRING,
        embeddings_routing_note=(
            f'Routing also sends any call_source whose lowercase value contains '
            f'"{EMBEDDINGS_SUBSTRING}" to this bucket (not only the examples below).'
        ),
        chat_default_note=(
            "Any call_source that does not match code_gen, classification, or the "
            "embeddings substring rule routes to this bucket."
        ),
    )
