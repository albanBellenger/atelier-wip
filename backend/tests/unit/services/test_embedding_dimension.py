"""Embedding dimension persistence on EmbeddingDimensionState."""

from unittest.mock import AsyncMock

import pytest

from app.exceptions import ApiError
from app.models import EmbeddingDimensionState
from app.services.embedding_service import EmbeddingService


@pytest.mark.asyncio
async def test_embed_batch_stores_then_validates_dimension(
    db_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    row = await db_session.get(EmbeddingDimensionState, 1)
    if row is None:
        row = EmbeddingDimensionState(id=1)
        db_session.add(row)
        await db_session.flush()
    row.observed_dim = None
    await db_session.flush()

    svc = EmbeddingService(db_session)
    monkeypatch.setattr(
        svc,
        "require_embedding_ready",
        AsyncMock(
            return_value=(
                "openai/text-embedding-3-small",
                "sk-test",
                "openai",
                "https://api.openai.com/v1",
            )
        ),
    )

    async def fake_ok(
        self: EmbeddingService,
        model: str,
        api_key: str,
        api_base: str,
        inputs: list[str],
        *,
        usage_scope: object | None,
    ) -> list[list[float]]:
        dr = await self._get_dimension_row()
        dim = 3
        if dr.observed_dim is None:
            dr.observed_dim = dim
            await self.db.flush()
        elif dr.observed_dim != dim:
            raise ApiError(
                status_code=502,
                code="EMBEDDING_DIMENSION_MISMATCH",
                message="dim",
            )
        return [[0.1, 0.2, 0.3] for _ in inputs]

    async def fake_bad(
        self: EmbeddingService,
        model: str,
        api_key: str,
        api_base: str,
        inputs: list[str],
        *,
        usage_scope: object | None,
    ) -> list[list[float]]:
        dr = await self._get_dimension_row()
        emb = [0.0] * 5
        if dr.observed_dim is not None and len(emb) != dr.observed_dim:
            raise ApiError(
                status_code=502,
                code="EMBEDDING_DIMENSION_MISMATCH",
                message="dim mismatch",
            )
        return [emb for _ in inputs]

    monkeypatch.setattr(EmbeddingService, "_litellm_embed_batch", fake_ok)

    out = await svc.embed_batch(["a", "b"], studio_id=None)
    assert len(out) == 2
    assert len(out[0]) == 3
    await db_session.refresh(row)
    assert row.observed_dim == 3

    out2 = await svc.embed_batch(["c"], studio_id=None)
    assert len(out2[0]) == 3

    monkeypatch.setattr(EmbeddingService, "_litellm_embed_batch", fake_bad)
    with pytest.raises(ApiError) as e:
        await svc.embed_batch(["x"], studio_id=None)
    assert e.value.error_code == "EMBEDDING_DIMENSION_MISMATCH"
