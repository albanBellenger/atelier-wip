"""Unit tests for DocSyncService pure helpers."""

from __future__ import annotations

from app.services.doc_sync_service import _overlap_score


def test_overlap_score_counts_shared_tokens() -> None:
    assert _overlap_score("alpha beta gamma", "beta delta") >= 1
