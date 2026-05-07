"""Tool admin configuration for embedding providers (singleton admin_config)."""

from uuid import UUID

from fastapi import BackgroundTasks
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ApiError
from app.models import AdminConfig, LlmProviderRegistry
from app.schemas.auth import (
    AdminConnectivityResult,
    AdminLlmProbeBody,
    EmbeddingAdminConfigResponse,
    EmbeddingAdminConfigUpdate,
)
from app.security.field_encryption import (
    admin_secret_suffix_hint,
    encode_admin_stored_secret,
)
from app.services.embedding_pipeline import (
    enqueue_sections_missing_embeddings_after_config,
)
from app.services.embedding_service import EmbeddingService, embedding_configured
from app.services.llm_service import LLMService


def _mask(s: str | None) -> bool:
    return bool(s and s.strip())


class AdminService:
    """CRUD for singleton `admin_config` row (id=1) — embedding fields only."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_or_create(self) -> AdminConfig:
        row = await self.db.get(AdminConfig, 1)
        if row is None:
            row = AdminConfig(id=1)
            self.db.add(row)
            await self.db.flush()
        return row

    async def get_embedding_public(self) -> EmbeddingAdminConfigResponse:
        row = await self.get_or_create()
        return EmbeddingAdminConfigResponse(
            embedding_provider=row.embedding_provider,
            embedding_model=row.embedding_model,
            embedding_api_base_url=row.embedding_api_base_url,
            embedding_api_key_set=_mask(row.embedding_api_key),
            embedding_api_key_hint=admin_secret_suffix_hint(row.embedding_api_key),
            embedding_dim=row.embedding_dim,
        )

    async def update_embedding(
        self,
        body: EmbeddingAdminConfigUpdate,
        background_tasks: BackgroundTasks | None = None,
        *,
        actor_user_id: UUID | None = None,
    ) -> EmbeddingAdminConfigResponse:
        was_embed = await embedding_configured(self.db)
        row = await self.get_or_create()
        data = body.model_dump(exclude_unset=True)
        if "embedding_api_key" in data:
            data["embedding_api_key"] = encode_admin_stored_secret(
                data["embedding_api_key"]
            )
        for key, value in data.items():
            setattr(row, key, value)
        await self.db.flush()
        now_embed = await embedding_configured(self.db)
        if actor_user_id is not None:
            from app.services.admin_activity_service import AdminActivityService

            await AdminActivityService(self.db).record(
                action="admin_config.updated",
                actor_user_id=actor_user_id,
                summary="Tool Admin embedding configuration updated",
            )
        if (
            not was_embed
            and now_embed
            and background_tasks is not None
        ):
            background_tasks.add_task(enqueue_sections_missing_embeddings_after_config)
        return await self.get_embedding_public()

    async def test_llm(self, body: AdminLlmProbeBody | None = None) -> AdminConnectivityResult:
        b = body or AdminLlmProbeBody()
        n = await self.db.scalar(select(func.count()).select_from(LlmProviderRegistry))
        if not n:
            return AdminConnectivityResult(
                ok=False,
                message="No LLM providers configured.",
                detail=(
                    "Add at least one provider in Admin Console → LLM (provider registry), "
                    "including a default provider with an API key."
                ),
            )
        if not (b.provider_key or "").strip():
            from app.services.llm_registry_credentials import get_default_llm_registry_row

            default_row = await get_default_llm_registry_row(self.db)
            if default_row is None:
                return AdminConnectivityResult(
                    ok=False,
                    message="No default LLM provider is set.",
                    detail=(
                        "Mark one connected provider as default in Admin Console → LLM, "
                        "or pass provider_key in the probe request."
                    ),
                )
        return await LLMService(self.db).admin_connectivity_probe(
            model_override=b.model,
            api_base_url_override=b.api_base_url,
            provider_key=b.provider_key,
        )

    async def test_embedding(self) -> AdminConnectivityResult:
        """Single-vector embedding using stored embedding config."""
        try:
            emb = EmbeddingService(self.db)
            vectors = await emb.embed_batch(["Atelier connectivity probe"])
        except ApiError as e:
            detail = e.detail if isinstance(e.detail, str) else str(e.detail)
            return AdminConnectivityResult(
                ok=False,
                message="Embedding call failed.",
                detail=detail,
            )
        except Exception as e:
            return AdminConnectivityResult(
                ok=False,
                message="Embedding request failed.",
                detail=str(e)[:800],
            )
        if not vectors or not vectors[0]:
            return AdminConnectivityResult(
                ok=False,
                message="Embedding API returned no vectors.",
                detail=None,
            )
        dim = len(vectors[0])
        return AdminConnectivityResult(
            ok=True,
            message=f"Embedding connection succeeded ({dim} dimensions).",
            detail=None,
        )
