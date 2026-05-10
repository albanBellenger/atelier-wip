"""Platform admin routes (infrastructure: embeddings, LLM registry, studio directory)."""

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Body, Depends, Query, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_studio_for_platform_admin, require_platform_admin
from app.exceptions import ApiError
from app.models import Studio, User
from app.schemas.auth import (
    AdminConnectivityResult,
    AdminEmbeddingProbeBody,
    AdminLlmProbeBody,
    AdminStatusUpdate,
    UserCreate,
    UserPublic,
)
from app.schemas.admin_console import (
    AdminConsoleOverviewResponse,
    AdminEmbeddingLibraryStudioResponse,
    AdminStudioDetailResponse,
    AdminUserDirectoryRowResponse,
    EmbeddingReindexPolicyResponse,
    EmbeddingReindexPolicyUpdate,
    LlmDeploymentResponse,
    LlmModelSuggestionsResponse,
    LlmProviderRegistryResponse,
    LlmProviderRegistryUpdate,
    LlmRoutingBucketsResponse,
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
from app.services.admin_user_directory_service import AdminUserDirectoryService
from app.services.auth_service import AuthService
from app.services.embedding_admin_service import EmbeddingAdminService
from app.services.embedding_pipeline import (
    enqueue_sections_missing_embeddings_after_config,
)
from app.services.embedding_service import embedding_platform_resolvable
from app.services.llm_connectivity_service import LlmConnectivityService
from app.services.llm_model_suggestions_service import LlmModelSuggestionsService
from app.services.llm_routing_buckets import build_llm_routing_buckets_response
from app.services.studio_service import StudioService
from app.services.studio_tool_admin_service import StudioToolAdminService

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/config", include_in_schema=False, response_model=None)
async def admin_config_get_removed(_: User = Depends(require_platform_admin)) -> None:
    raise ApiError(
        status_code=404,
        code="NOT_FOUND",
        message=(
            "GET /admin/config was removed; configure embeddings via Admin Console → LLM "
            "(provider registry + embeddings routing rule)."
        ),
    )


@router.put("/config", include_in_schema=False, response_model=None)
async def admin_config_put_removed(_: User = Depends(require_platform_admin)) -> None:
    raise ApiError(
        status_code=404,
        code="NOT_FOUND",
        message=(
            "PUT /admin/config was removed; configure embeddings via Admin Console → LLM "
            "(provider registry + embeddings routing rule)."
        ),
    )


@router.get("/users", response_model=list[AdminUserDirectoryRowResponse])
async def admin_list_users(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_platform_admin),
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> list[AdminUserDirectoryRowResponse]:
    return await AdminUserDirectoryService(session).list_users(limit=limit, offset=offset)


@router.post("/users", response_model=UserPublic, status_code=status.HTTP_201_CREATED)
async def admin_create_user(
    body: UserCreate,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_platform_admin),
) -> UserPublic:
    return await AuthService(session).create_user_by_admin(body)


@router.put("/users/{user_id}/admin-status", response_model=UserPublic)
async def set_user_platform_admin_status(
    user_id: UUID,
    body: AdminStatusUpdate,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin),
) -> UserPublic:
    return await AdminService(session).set_platform_admin_status(
        user_id, body.is_platform_admin, current_user
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
    body: AdminEmbeddingProbeBody = Body(default_factory=AdminEmbeddingProbeBody),
) -> AdminConnectivityResult:
    return await AdminService(session).test_embedding(body)


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


@router.delete("/studios/{studio_id}", status_code=204)
async def admin_delete_studio(
    studio_id: UUID,
    session: AsyncSession = Depends(get_db),
    studio: Studio = Depends(get_studio_for_platform_admin),
) -> Response:
    assert studio.id == studio_id
    await StudioService(session).delete_studio_by_id(studio_id)
    return Response(status_code=204)


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


@router.put("/llm/providers/{provider_id}", response_model=LlmProviderRegistryResponse)
async def upsert_llm_provider(
    provider_id: str,
    body: LlmProviderRegistryUpdate,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_platform_admin),
) -> LlmProviderRegistryResponse:
    was = await embedding_platform_resolvable(session)
    out = await LlmConnectivityService(session).upsert_provider(provider_id, body)
    now = await embedding_platform_resolvable(session)
    if not was and now:
        background_tasks.add_task(enqueue_sections_missing_embeddings_after_config)
    return out


@router.delete("/llm/providers/{provider_id}", status_code=204)
async def delete_llm_provider(
    provider_id: str,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_platform_admin),
) -> Response:
    await LlmConnectivityService(session).delete_provider(provider_id)
    return Response(status_code=204)


@router.get("/llm/model-suggestions", response_model=LlmModelSuggestionsResponse)
async def get_llm_model_suggestions(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_platform_admin),
    provider_id: str | None = Query(default=None),
    litellm_provider: str | None = Query(default=None),
    q: str | None = Query(default=None),
    mode: Literal["chat", "embedding"] = Query(default="chat"),
    source: Literal["auto", "catalog", "upstream", "registry"] = Query(default="auto"),
) -> LlmModelSuggestionsResponse:
    return await LlmModelSuggestionsService(session).suggest(
        provider_id=provider_id,
        litellm_provider=litellm_provider,
        q=q,
        mode=mode,
        source=source,
    )


@router.get("/llm/routing/buckets", response_model=LlmRoutingBucketsResponse)
async def get_llm_routing_buckets(
    _: User = Depends(require_platform_admin),
) -> LlmRoutingBucketsResponse:
    return build_llm_routing_buckets_response()


@router.get("/llm/routing", response_model=list[LlmRoutingRuleResponse])
async def get_llm_routing(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_platform_admin),
) -> list[LlmRoutingRuleResponse]:
    return await LlmConnectivityService(session).list_routing()


@router.put("/llm/routing", response_model=list[LlmRoutingRuleResponse])
async def put_llm_routing(
    body: LlmRoutingRuleUpdate,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_platform_admin),
) -> list[LlmRoutingRuleResponse]:
    was = await embedding_platform_resolvable(session)
    out = await LlmConnectivityService(session).put_routing(body)
    now = await embedding_platform_resolvable(session)
    if not was and now:
        background_tasks.add_task(enqueue_sections_missing_embeddings_after_config)
    return out


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
