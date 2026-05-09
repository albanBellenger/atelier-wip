"""Embedding calls via LiteLLM (OpenAI-compatible embeddings API)."""

from __future__ import annotations

from decimal import Decimal
from typing import Any
from uuid import UUID

import litellm
import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ApiError
from app.models import EmbeddingDimensionState, LlmProviderRegistry
from app.openai_compat_urls import embeddings_url, openai_v1_base
from app.schemas.token_usage_scope import TokenUsageScope
from app.security.field_encryption import decode_admin_stored_secret
from app.services.litellm_exception_mapping import map_litellm_exception
from app.services.litellm_model_id import normalize_litellm_embedding_model
from app.services.llm_policy_service import LlmPolicyService
from app.services.token_tracker import record_usage

log = structlog.get_logger("atelier.embedding")

# Default v1 base for tests mocking ``require_embedding_ready`` (4th element must be ``api_base``).
OPENAI_EMBEDDING_API_BASE = openai_v1_base(None)
# Legacy export (full ``…/embeddings`` URL) — prefer ``OPENAI_EMBEDDING_API_BASE`` for new code.
OPENAI_EMBEDDINGS_URL = embeddings_url(None)
EMBED_BATCH = 64


class EmbeddingService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def _get_dimension_row(self) -> EmbeddingDimensionState:
        row = await self.db.get(EmbeddingDimensionState, 1)
        if row is None:
            row = EmbeddingDimensionState(id=1)
            self.db.add(row)
            await self.db.flush()
        return row

    async def require_embedding_ready(
        self, studio_id: UUID | None
    ) -> tuple[str, str, str, str]:
        """Returns ``(model, api_key, provider_id, api_base)`` or raises ApiError 503.

        ``api_base`` is the OpenAI v1 root for LiteLLM (e.g. ``https://api.openai.com/v1``).
        Credentials and routing come from ``llm_provider_registry`` + embeddings routing rule.

        ``studio_id=None`` uses platform resolution (admin probe). Otherwise studio policy
        gates enabled providers without requiring chat ``selected_model`` to match.
        """
        pol = LlmPolicyService(self.db)
        raw_model, pk = await pol.resolve_embedding_route(studio_id=studio_id)
        if not raw_model or not pk:
            raise ApiError(
                status_code=503,
                code="EMBEDDING_NOT_CONFIGURED",
                message=(
                    "Tool Admin must add an embeddings routing rule and register the embedding "
                    "model on a connected LLM provider with an API key (Admin Console → LLM)."
                ),
            )
        reg_row = await self.db.scalar(
            select(LlmProviderRegistry).where(LlmProviderRegistry.provider_id == pk)
        )
        if reg_row is None:
            raise ApiError(
                status_code=503,
                code="EMBEDDING_NOT_CONFIGURED",
                message="Embedding provider registry row is missing.",
            )
        key = (decode_admin_stored_secret(reg_row.api_key) or "").strip()
        if not key:
            raise ApiError(
                status_code=503,
                code="EMBEDDING_NOT_CONFIGURED",
                message="Embedding provider has no API key configured.",
            )
        slug_raw = (reg_row.litellm_provider_slug or "").strip()
        model = normalize_litellm_embedding_model(
            raw_model,
            litellm_provider_slug=slug_raw or None,
            provider_name_fallback=(reg_row.provider_id or "").strip().lower(),
        )
        api_base = openai_v1_base(reg_row.api_base_url)
        return model, key, pk, api_base

    async def embed_batch(
        self,
        texts: list[str],
        *,
        studio_id: UUID | None,
        usage_scope: TokenUsageScope | None = None,
    ) -> list[list[float]]:
        if not texts:
            return []
        model, api_key, _provider_id, api_base = await self.require_embedding_ready(
            studio_id
        )
        out: list[list[float]] = []
        for start in range(0, len(texts), EMBED_BATCH):
            batch = texts[start : start + EMBED_BATCH]
            vectors = await self._litellm_embed_batch(
                model, api_key, api_base, batch, usage_scope=usage_scope
            )
            out.extend(vectors)
        return out

    async def _litellm_embed_batch(
        self,
        model: str,
        api_key: str,
        api_base: str,
        inputs: list[str],
        *,
        usage_scope: TokenUsageScope | None,
    ) -> list[list[float]]:
        try:
            response = await litellm.aembedding(
                model=model,
                input=inputs,
                api_key=api_key,
                api_base=api_base,
                timeout=120.0,
            )
        except Exception as e:
            raise map_litellm_exception(e, family="embedding") from e

        data_list = getattr(response, "data", None) or []
        rows: list[Any] = list(data_list) if hasattr(data_list, "__iter__") else []

        def _sort_key(item: Any) -> int:
            if isinstance(item, dict):
                return int(item.get("index") or 0)
            return int(getattr(item, "index", 0) or 0)

        rows.sort(key=_sort_key)

        vectors: list[list[float]] = []
        dim_row = await self._get_dimension_row()
        for item in rows:
            emb = getattr(item, "embedding", None)
            if emb is None and isinstance(item, dict):
                emb = item.get("embedding")
            if not isinstance(emb, list):
                raise ApiError(
                    status_code=502,
                    code="EMBEDDING_INVALID_RESPONSE",
                    message="Invalid embedding response.",
                )
            dim = len(emb)
            if dim_row.observed_dim is None:
                dim_row.observed_dim = dim
                await self.db.flush()
            elif dim_row.observed_dim != dim:
                raise ApiError(
                    status_code=502,
                    code="EMBEDDING_DIMENSION_MISMATCH",
                    message=(
                        f"Embedding dimension mismatch: stored {dim_row.observed_dim}, "
                        f"provider returned {dim}."
                    ),
                )
            vectors.append([float(x) for x in emb])
        if len(vectors) != len(inputs):
            raise ApiError(
                status_code=502,
                code="EMBEDDING_COUNT_MISMATCH",
                message="Embedding provider returned wrong number of vectors.",
            )

        if usage_scope is not None:
            u = getattr(response, "usage", None)
            ud: dict[str, Any]
            if u is not None and hasattr(u, "model_dump"):
                ud = u.model_dump()
            elif isinstance(u, dict):
                ud = u
            else:
                ud = {}
            inp_tok = int(ud.get("total_tokens") or ud.get("prompt_tokens") or 0)
            cost_override: Decimal | None = None
            try:
                raw_c = litellm.completion_cost(
                    completion_response=response,
                    call_type="aembedding",
                )
                if raw_c is not None:
                    cost_override = Decimal(str(raw_c)).quantize(Decimal("0.000001"))
            except Exception:
                cost_override = None
            if inp_tok > 0:
                await record_usage(
                    self.db,
                    usage_scope,
                    call_source="embedding",
                    model=model,
                    input_tokens=inp_tok,
                    output_tokens=0,
                    estimated_cost_override=cost_override,
                )
        return vectors


async def embedding_resolvable(session: AsyncSession, studio_id: UUID | None) -> bool:
    """True when ``EmbeddingService.require_embedding_ready`` would succeed for ``studio_id``."""
    pol = LlmPolicyService(session)
    raw_model, pk = await pol.resolve_embedding_route(studio_id=studio_id)
    if not raw_model or not pk:
        return False
    row = await session.scalar(
        select(LlmProviderRegistry).where(LlmProviderRegistry.provider_id == pk)
    )
    if row is None:
        return False
    key = (decode_admin_stored_secret(row.api_key) or "").strip()
    return bool(key)


async def embedding_platform_resolvable(session: AsyncSession) -> bool:
    """Embedding resolution with no studio policy (routing + registry only)."""
    return await embedding_resolvable(session, None)


# Back-compat alias for call sites still named embedding_configured
async def embedding_configured(session: AsyncSession) -> bool:
    """Prefer :func:`embedding_platform_resolvable` — kept for minimal churn in jobs."""
    return await embedding_platform_resolvable(session)
