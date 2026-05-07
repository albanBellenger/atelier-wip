"""Platform admin routes (infrastructure: embeddings, LLM registry, read-only studio directory)."""

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Body, Depends, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_studio_for_platform_admin, require_platform_admin
from app.exceptions import ApiError
from app.models import Studio, User
from app.schemas.auth import (
    AdminConnectivityResult,
    AdminLlmProbeBody,
    EmbeddingAdminConfigResponse,
    EmbeddingAdminConfigUpdate,
)
from app.schemas.admin_console import (
    AdminConsoleOverviewResponse,
    AdminEmbeddingLibraryStudioResponse,
    AdminStudioDetailResponse,
    EmbeddingModelRegistryResponse,
    EmbeddingModelRegistryUpdate,
    EmbeddingReindexPolicyResponse,
    EmbeddingReindexPolicyUpdate,
    LlmDeploymentResponse,
    LlmModelSuggestionsResponse,
    LlmProviderRegistryResponse,
    LlmProviderRegistryUpdate,
    LlmRoutingRuleResponse,
    LlmRoutingRuleUpdate,
    StudioGitLabResponse,
    StudioLlmPolicyUpdate,
    StudioLlmPolicyRowResponse,
    StudioOverviewRowResponse,
)
from app.schemas.studio import StudioCreate, StudioResponse
from app.services.admin_overview_service import AdminOverviewService
from app.services.admin_service import AdminService
from app.services.admin_studio_console_service import AdminStudioConsoleService
from app.services.embedding_admin_service import EmbeddingAdminService
from app.services.llm_connectivity_service import LlmConnectivityService
from app.services.llm_model_suggestions_service import LlmModelSuggestionsService
from app.services.studio_service import StudioService
from app.services.studio_tool_admin_service import StudioToolAdminService

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/embedding-config", response_model=EmbeddingAdminConfigResponse)
async def get_admin_embedding_config(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_platform_admin),
) -> EmbeddingAdminConfigResponse:
    return await AdminService(session).get_embedding_public()


@router.put("/embedding-config", response_model=EmbeddingAdminConfigResponse)
async def put_admin_embedding_config(
    background_tasks: BackgroundTasks,
    body: EmbeddingAdminConfigUpdate,
    session: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_platform_admin),
) -> EmbeddingAdminConfigResponse:
    return await AdminService(session).update_embedding(
        body, background_tasks, actor_user_id=admin_user.id
    )


@router.get("/config", include_in_schema=False, response_model=None)
async def admin_config_get_removed(_: User = Depends(require_platform_admin)) -> None:
    raise ApiError(
        status_code=404,
        code="NOT_FOUND",
        message=(
            "GET /admin/config was removed; use GET /admin/embedding-config for embeddings "
            "or Admin Console → LLM for provider registry."
        ),
    )


@router.put("/config", include_in_schema=False, response_model=None)
async def admin_config_put_removed(_: User = Depends(require_platform_admin)) -> None:
    raise ApiError(
        status_code=404,
        code="NOT_FOUND",
        message=(
            "PUT /admin/config was removed; use PUT /admin/embedding-config for embeddings "
            "or Admin Console → LLM for provider registry."
        ),
    )


@router.post("/test/llm", response_model=AdminConnectivityResult)
async def test_admin_llm(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_platform_admin),
    body: AdminLlmProbeBody = Body(default_factory=AdminLlmProbeBody),
) -> AdminConnectivityResult:
    return await AdminService(session).test_llm(body)


@router.post("/test/embedding", response_model=AdminConnectivityResult)
async def test_admin_embedding(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_platform_admin),
) -> AdminConnectivityResult:
    return await AdminService(session).test_embedding()


@router.post("/jobs/stale-draft-notifications")
async def run_stale_draft_notifications_admin(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_platform_admin),
) -> dict[str, int]:
    from app.services.draft_unpublished_notification_job import (
        run_draft_unpublished_notifications,
    )

    n = await run_draft_unpublished_notifications(session)
    await session.commit()
    return {"notifications_created": n}


@router.get("/console/overview", response_model=AdminConsoleOverviewResponse)
async def admin_console_overview(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_platform_admin),
) -> AdminConsoleOverviewResponse:
    return await AdminOverviewService(session).overview()


@router.get("/studios", response_model=list[StudioOverviewRowResponse])
async def admin_list_studios(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_platform_admin),
) -> list[StudioOverviewRowResponse]:
    return await AdminStudioConsoleService(session).list_studios()


@router.post("/studios", response_model=StudioResponse)
async def admin_create_studio(
    body: StudioCreate,
    session: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_platform_admin),
) -> StudioResponse:
    return await StudioService(session).create_studio(admin_user, body)


@router.get("/studios/{studio_id}", response_model=AdminStudioDetailResponse)
async def admin_get_studio(
    studio_id: UUID,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_platform_admin),
    studio: Studio = Depends(get_studio_for_platform_admin),
) -> AdminStudioDetailResponse:
    assert studio.id == studio_id
    return await AdminStudioConsoleService(session).get_studio(studio)


@router.get("/llm/deployment", response_model=LlmDeploymentResponse)
async def get_llm_deployment(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_platform_admin),
) -> LlmDeploymentResponse:
    providers = await LlmConnectivityService(session).list_providers()
    return LlmDeploymentResponse(
        has_providers=len(providers) > 0,
        providers=providers,
    )


@router.get("/llm/providers", response_model=list[LlmProviderRegistryResponse])
async def list_llm_providers(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_platform_admin),
) -> list[LlmProviderRegistryResponse]:
    return await LlmConnectivityService(session).list_providers()


@router.put("/llm/providers/{provider_key}", response_model=LlmProviderRegistryResponse)
async def upsert_llm_provider(
    provider_key: str,
    body: LlmProviderRegistryUpdate,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_platform_admin),
) -> LlmProviderRegistryResponse:
    return await LlmConnectivityService(session).upsert_provider(provider_key, body)


@router.delete("/llm/providers/{provider_key}", status_code=204)
async def delete_llm_provider(
    provider_key: str,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_platform_admin),
) -> Response:
    await LlmConnectivityService(session).delete_provider(provider_key)
    return Response(status_code=204)


@router.get("/llm/model-suggestions", response_model=LlmModelSuggestionsResponse)
async def get_llm_model_suggestions(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_platform_admin),
    provider_key: str | None = Query(default=None),
    litellm_provider: str | None = Query(default=None),
    q: str | None = Query(default=None),
    mode: Literal["chat", "embedding"] = Query(default="chat"),
    source: Literal["auto", "catalog", "upstream"] = Query(default="auto"),
) -> LlmModelSuggestionsResponse:
    return await LlmModelSuggestionsService(session).suggest(
        provider_key=provider_key,
        litellm_provider=litellm_provider,
        q=q,
        mode=mode,
        source=source,
    )


@router.get("/llm/routing", response_model=list[LlmRoutingRuleResponse])
async def get_llm_routing(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_platform_admin),
) -> list[LlmRoutingRuleResponse]:
    return await LlmConnectivityService(session).list_routing()


@router.put("/llm/routing", response_model=list[LlmRoutingRuleResponse])
async def put_llm_routing(
    body: LlmRoutingRuleUpdate,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_platform_admin),
) -> list[LlmRoutingRuleResponse]:
    return await LlmConnectivityService(session).put_routing(body)


@router.get(
    "/studios/{studio_id}/llm-policy",
    response_model=list[StudioLlmPolicyRowResponse],
)
async def get_studio_llm_policy(
    studio_id: UUID,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_platform_admin),
    studio: Studio = Depends(get_studio_for_platform_admin),
) -> list[StudioLlmPolicyRowResponse]:
    assert studio.id == studio_id
    return await LlmConnectivityService(session).get_studio_policy(studio_id)


@router.put(
    "/studios/{studio_id}/llm-policy",
    response_model=list[StudioLlmPolicyRowResponse],
)
async def put_studio_llm_policy(
    studio_id: UUID,
    body: StudioLlmPolicyUpdate,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_platform_admin),
    studio: Studio = Depends(get_studio_for_platform_admin),
) -> list[StudioLlmPolicyRowResponse]:
    assert studio.id == studio_id
    return await LlmConnectivityService(session).put_studio_policy(studio_id, body)


@router.get("/studios/{studio_id}/gitlab", response_model=StudioGitLabResponse)
async def get_studio_gitlab(
    studio_id: UUID,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_platform_admin),
    studio: Studio = Depends(get_studio_for_platform_admin),
) -> StudioGitLabResponse:
    assert studio.id == studio_id
    return await StudioToolAdminService(session).get_gitlab(studio)


@router.get("/embeddings/library", response_model=list[AdminEmbeddingLibraryStudioResponse])
async def list_embedding_library_overview(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_platform_admin),
) -> list[AdminEmbeddingLibraryStudioResponse]:
    return await EmbeddingAdminService(session).library_overview()


@router.get("/embeddings/models", response_model=list[EmbeddingModelRegistryResponse])
async def list_embedding_models(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_platform_admin),
) -> list[EmbeddingModelRegistryResponse]:
    return await EmbeddingAdminService(session).list_models()


@router.put("/embeddings/models/{model_id}", response_model=EmbeddingModelRegistryResponse)
async def upsert_embedding_model(
    model_id: str,
    body: EmbeddingModelRegistryUpdate,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_platform_admin),
) -> EmbeddingModelRegistryResponse:
    return await EmbeddingAdminService(session).upsert_model(body, model_id=model_id)


@router.delete("/embeddings/models/{model_id}", status_code=204)
async def delete_embedding_model(
    model_id: str,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_platform_admin),
) -> Response:
    await EmbeddingAdminService(session).delete_model(model_id)
    return Response(status_code=204)


@router.get("/embeddings/reindex-policy", response_model=EmbeddingReindexPolicyResponse)
async def get_embedding_reindex_policy(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_platform_admin),
) -> EmbeddingReindexPolicyResponse:
    return await EmbeddingAdminService(session).get_reindex_policy()


@router.patch("/embeddings/reindex-policy", response_model=EmbeddingReindexPolicyResponse)
async def patch_embedding_reindex_policy(
    body: EmbeddingReindexPolicyUpdate,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_platform_admin),
) -> EmbeddingReindexPolicyResponse:
    return await EmbeddingAdminService(session).patch_reindex_policy(body)
