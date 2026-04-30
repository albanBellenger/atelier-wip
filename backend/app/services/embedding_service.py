"""Embedding calls via Tool Admin OpenAI-compatible embeddings API."""

from __future__ import annotations

from typing import Any

import httpx
import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ApiError
from app.models import AdminConfig
from app.openai_compat_urls import embeddings_url

log = structlog.get_logger("atelier.embedding")

EXPECTED_DIM = 1536
OPENAI_EMBEDDINGS_URL = embeddings_url(None)
EMBED_BATCH = 64


class EmbeddingService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def _get_config(self) -> AdminConfig:
        row = await self.db.get(AdminConfig, 1)
        if row is None:
            row = AdminConfig(id=1)
            self.db.add(row)
            await self.db.flush()
        return row

    async def require_embedding_ready(self) -> tuple[str, str, str, str]:
        """Returns (model, api_key, provider, embeddings_url) or raises ApiError 503."""
        cfg = await self._get_config()
        model = (cfg.embedding_model or "").strip()
        key = (cfg.embedding_api_key or "").strip()
        provider = (cfg.embedding_provider or "").strip().lower()
        if not model or not key:
            raise ApiError(
                status_code=503,
                code="EMBEDDING_NOT_CONFIGURED",
                message="Tool Admin must configure embedding provider, model, and API key.",
            )
        if provider not in ("openai", ""):
            raise ApiError(
                status_code=503,
                code="EMBEDDING_PROVIDER_UNSUPPORTED",
                message=(
                    "Set embedding_provider to 'openai' (or leave empty) for OpenAI-compatible APIs; "
                    "use embedding API base URL for a custom endpoint."
                ),
            )
        emb_url = embeddings_url(cfg.embedding_api_base_url)
        return model, key, provider or "openai", emb_url

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        model, api_key, _provider, emb_url = await self.require_embedding_ready()
        out: list[list[float]] = []
        for start in range(0, len(texts), EMBED_BATCH):
            batch = texts[start : start + EMBED_BATCH]
            vectors = await self._openai_embed(model, api_key, batch, emb_url)
            out.extend(vectors)
        return out

    async def _openai_embed(
        self, model: str, api_key: str, inputs: list[str], embeddings_endpoint: str
    ) -> list[list[float]]:
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        body: dict[str, Any] = {"model": model, "input": inputs}
        async with httpx.AsyncClient(timeout=120.0) as client:
            r = await client.post(embeddings_endpoint, headers=headers, json=body)
            if r.status_code >= 400:
                log.warning(
                    "embedding_http_error",
                    status=r.status_code,
                    body=r.text[:500],
                )
                raise ApiError(
                    status_code=502,
                    code="EMBEDDING_UPSTREAM_ERROR",
                    message="Embedding provider returned an error.",
                )
            data = r.json()
        items = data.get("data") or []
        # Sort by index for safety
        items.sort(key=lambda x: int(x.get("index", 0)))
        vectors: list[list[float]] = []
        for item in items:
            emb = item.get("embedding")
            if not isinstance(emb, list):
                raise ApiError(
                    status_code=502,
                    code="EMBEDDING_INVALID_RESPONSE",
                    message="Invalid embedding response.",
                )
            if len(emb) != EXPECTED_DIM:
                raise ApiError(
                    status_code=502,
                    code="EMBEDDING_DIMENSION_MISMATCH",
                    message=f"Expected embedding dimension {EXPECTED_DIM}, got {len(emb)}.",
                )
            vectors.append([float(x) for x in emb])
        if len(vectors) != len(inputs):
            raise ApiError(
                status_code=502,
                code="EMBEDDING_COUNT_MISMATCH",
                message="Embedding provider returned wrong number of vectors.",
            )
        return vectors


async def embedding_configured(session: AsyncSession) -> bool:
    """True when embedding API can be called (for optional section re-embed)."""
    r = await session.execute(select(AdminConfig).where(AdminConfig.id == 1))
    row = r.scalar_one_or_none()
    if row is None:
        return False
    prov = (row.embedding_provider or "").strip().lower()
    if prov and prov != "openai":
        return False
    return bool((row.embedding_model or "").strip() and (row.embedding_api_key or "").strip())
