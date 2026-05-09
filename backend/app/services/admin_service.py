"""Platform admin helpers (connectivity probes, user admin flags)."""

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ApiError
from app.models import LlmProviderRegistry, User
from app.schemas.auth import AdminConnectivityResult, AdminLlmProbeBody, UserPublic
from app.services.embedding_service import EmbeddingService
from app.services.llm_service import LLMService


class AdminService:
    """Connectivity probes and platform-admin user operations."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def set_platform_admin_status(
        self,
        target_user_id: UUID,
        is_platform_admin: bool,
        requesting_user: User,
    ) -> UserPublic:
        if target_user_id == requesting_user.id and is_platform_admin is False:
            raise ApiError(
                status_code=400,
                code="SELF_REVOCATION_BLOCKED",
                message="A platform admin cannot revoke their own platform admin status.",
            )
        target_user = await self.db.get(User, target_user_id)
        if target_user is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="User not found.",
            )
        target_user.is_platform_admin = is_platform_admin
        self.db.add(target_user)
        await self.db.flush()
        return UserPublic.model_validate(target_user)

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
        """Single-vector embedding via LLM registry + embeddings routing rule."""
        try:
            emb = EmbeddingService(self.db)
            vectors = await emb.embed_batch(
                ["Atelier connectivity probe"], studio_id=None
            )
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
