"""Integration-test stubs for embedding I/O (avoid real LiteLLM / registry seeding)."""

from __future__ import annotations

import pytest

from app.services.embedding_service import EmbeddingService, OPENAI_EMBEDDING_API_BASE


def patch_fake_embedding_transport(monkeypatch: pytest.MonkeyPatch) -> None:
    """Patches class methods and module-level ``embedding_resolvable`` bindings."""

    async def ready(
        _self: object, _studio_id: object | None = None
    ) -> tuple[str, str, str, str]:
        return ("text-embedding-3-small", "sk-fake", "openai", OPENAI_EMBEDDING_API_BASE)

    async def batch(
        _self: object,
        texts: list[str],
        *,
        studio_id: object | None = None,
        usage_scope: object | None = None,
    ) -> list[list[float]]:
        return [[0.0] * 1536 for _ in texts]

    async def resolvable(_session: object, _studio_id: object | None) -> bool:
        return True

    monkeypatch.setattr(EmbeddingService, "require_embedding_ready", ready)
    monkeypatch.setattr(EmbeddingService, "embed_batch", batch)
    monkeypatch.setattr(
        "app.services.embedding_service.embedding_resolvable",
        resolvable,
    )
    monkeypatch.setattr(
        "app.services.embedding_pipeline.embedding_resolvable",
        resolvable,
    )
