"""Tool admin configuration for LLM and embedding providers."""

from uuid import UUID

from fastapi import BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ApiError
from app.models import AdminConfig, User
from app.schemas.auth import (
    AdminConfigResponse,
    AdminConfigUpdate,
    AdminConnectivityResult,
    AdminLlmProbeBody,
    UserPublic,
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
    """CRUD for singleton `admin_config` row (id=1)."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_or_create(self) -> AdminConfig:
        row = await self.db.get(AdminConfig, 1)
        if row is None:
            row = AdminConfig(id=1)
            self.db.add(row)
            await self.db.flush()
        return row

    async def get_public(self) -> AdminConfigResponse:
        row = await self.get_or_create()
        return AdminConfigResponse(
            llm_provider=row.llm_provider,
            llm_model=row.llm_model,
            llm_api_base_url=row.llm_api_base_url,
            llm_api_key_set=_mask(row.llm_api_key),
            llm_api_key_hint=admin_secret_suffix_hint(row.llm_api_key),
            embedding_provider=row.embedding_provider,
            embedding_model=row.embedding_model,
            embedding_api_base_url=row.embedding_api_base_url,
            embedding_api_key_set=_mask(row.embedding_api_key),
            embedding_api_key_hint=admin_secret_suffix_hint(row.embedding_api_key),
            embedding_dim=row.embedding_dim,
        )

    async def update(
        self,
        body: AdminConfigUpdate,
        background_tasks: BackgroundTasks | None = None,
        *,
        actor_user_id: UUID | None = None,
    ) -> AdminConfigResponse:
        was_embed = await embedding_configured(self.db)
        row = await self.get_or_create()
        data = body.model_dump(exclude_unset=True)
        if "llm_api_key" in data:
            data["llm_api_key"] = encode_admin_stored_secret(data["llm_api_key"])
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
                summary="Tool Admin LLM / embedding configuration updated",
            )
        if (
            not was_embed
            and now_embed
            and background_tasks is not None
        ):
            background_tasks.add_task(enqueue_sections_missing_embeddings_after_config)
        return await self.get_public()

    async def set_admin_status(
        self,
        target_user_id: UUID,
        is_tool_admin: bool,
        requesting_user: User,
    ) -> UserPublic:
        if target_user_id == requesting_user.id and is_tool_admin is False:
            raise ApiError(
                status_code=400,
                code="SELF_REVOCATION_BLOCKED",
                message="A Tool Admin cannot revoke their own admin status.",
            )
        target_user = await self.db.get(User, target_user_id)
        if target_user is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="User not found.",
            )
        target_user.is_tool_admin = is_tool_admin
        self.db.add(target_user)
        await self.db.flush()
        return UserPublic.model_validate(target_user)

    async def test_llm(self, body: AdminLlmProbeBody | None = None) -> AdminConnectivityResult:
        b = body or AdminLlmProbeBody()
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
