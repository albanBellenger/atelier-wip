"""Embedding dimension persistence on AdminConfig."""

import pytest

from app.exceptions import ApiError
from app.models import AdminConfig
from app.services.embedding_service import EmbeddingService


@pytest.mark.asyncio
async def test_embed_batch_stores_then_validates_dimension(
    db_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    row = await db_session.get(AdminConfig, 1)
    if row is None:
        row = AdminConfig(id=1)
        db_session.add(row)
        await db_session.flush()
    row.embedding_model = "m"
    row.embedding_api_key = "k"
    row.embedding_provider = "openai"
    row.embedding_dim = None
    await db_session.flush()

    svc = EmbeddingService(db_session)

    async def fake_ok(
        self: EmbeddingService,
        model: str,
        api_key: str,
        api_base: str,
        inputs: list[str],
        *,
        context: object | None,
    ) -> list[list[float]]:
        cfg = await self._get_config()
        dim = 3
        if cfg.embedding_dim is None:
            cfg.embedding_dim = dim
            await self.db.flush()
        elif cfg.embedding_dim != dim:
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
        context: object | None,
    ) -> list[list[float]]:
        cfg = await self._get_config()
        emb = [0.0] * 5
        if cfg.embedding_dim is not None and len(emb) != cfg.embedding_dim:
            raise ApiError(
                status_code=502,
                code="EMBEDDING_DIMENSION_MISMATCH",
                message="dim mismatch",
            )
        return [emb for _ in inputs]

    monkeypatch.setattr(EmbeddingService, "_litellm_embed_batch", fake_ok)

    out = await svc.embed_batch(["a", "b"])
    assert len(out) == 2
    assert len(out[0]) == 3
    await db_session.refresh(row)
    assert row.embedding_dim == 3

    out2 = await svc.embed_batch(["c"])
    assert len(out2[0]) == 3

    monkeypatch.setattr(EmbeddingService, "_litellm_embed_batch", fake_bad)
    with pytest.raises(ApiError) as e:
        await svc.embed_batch(["x"])
    assert e.value.error_code == "EMBEDDING_DIMENSION_MISMATCH"
