"""Tool admin routes."""

from datetime import date
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Body, Depends, Query, Request, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_studio_for_tool_admin, require_tool_admin
from app.models import Studio, User
from app.schemas.auth import (
    AdminConfigResponse,
    AdminConfigUpdate,
    AdminConnectivityResult,
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
    EmbeddingModelRegistryResponse,
    EmbeddingModelRegistryUpdate,
    EmbeddingReindexPolicyResponse,
    EmbeddingReindexPolicyUpdate,
    LlmDeploymentResponse,
    LlmProviderRegistryResponse,
    LlmProviderRegistryUpdate,
    LlmRoutingRuleResponse,
    LlmRoutingRuleUpdate,
    MemberBudgetUpdate,
    MemberBudgetRowResponse,
    StudioGitLabResponse,
    StudioGitLabUpdate,
    StudioLlmPolicyUpdate,
    StudioLlmPolicyRowResponse,
    StudioOverviewRowResponse,
    StudioToolAdminUpdate,
)
from app.schemas.cross_studio import (
    CrossStudioAccessAdminRow,
    CrossStudioResolveBody,
    CrossStudioRequestResult,
)
from app.schemas.studio import StudioCreate, StudioResponse
from app.services.auth_service import AuthService
from app.services.admin_overview_service import AdminOverviewService
from app.services.admin_service import AdminService
from app.services.admin_studio_console_service import AdminStudioConsoleService
from app.services.admin_user_directory_service import AdminUserDirectoryService
from app.services.cross_studio_service import CrossStudioService
from app.services.embedding_admin_service import EmbeddingAdminService
from app.services.llm_connectivity_service import LlmConnectivityService
from app.services.studio_member_budget_admin_service import StudioMemberBudgetAdminService
from app.services.studio_service import StudioService
from app.services.studio_tool_admin_service import StudioToolAdminService
from app.schemas.token_usage_report import (
    TokenUsageReportOut,
    TokenUsageRowOut,
    TokenUsageTotalsOut,
)
from app.services.token_usage_query_service import TokenUsageQueryService

router = APIRouter(prefix="/admin", tags=["admin"])


def _wants_csv(request: Request) -> bool:
    accept = (request.headers.get("accept") or "").lower()
    return "text/csv" in accept


@router.get("/config", response_model=AdminConfigResponse)
async def get_admin_config(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
) -> AdminConfigResponse:
    return await AdminService(session).get_public()


@router.put("/config", response_model=AdminConfigResponse)
async def put_admin_config(
    background_tasks: BackgroundTasks,
    body: AdminConfigUpdate,
    session: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_tool_admin),
) -> AdminConfigResponse:
    return await AdminService(session).update(
        body, background_tasks, actor_user_id=admin_user.id
    )


@router.post("/test/llm", response_model=AdminConnectivityResult)
async def test_admin_llm(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
    body: AdminLlmProbeBody = Body(default_factory=AdminLlmProbeBody),
) -> AdminConnectivityResult:
    return await AdminService(session).test_llm(body)


@router.post("/test/embedding", response_model=AdminConnectivityResult)
async def test_admin_embedding(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
) -> AdminConnectivityResult:
    return await AdminService(session).test_embedding()


@router.put("/users/{user_id}/admin-status", response_model=UserPublic)
async def set_user_admin_status(
    user_id: UUID,
    body: AdminStatusUpdate,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_tool_admin),
) -> UserPublic:
    return await AdminService(session).set_admin_status(
        user_id, body.is_tool_admin, current_user
    )


@router.get("/cross-studio", response_model=list[CrossStudioAccessAdminRow])
async def list_cross_studio_requests(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
    status: str | None = Query(None, description="Filter by status"),
    limit: int = Query(100, ge=1, le=500),
) -> list[CrossStudioAccessAdminRow]:
    return await CrossStudioService(session).list_tool_admin(
        status=status, limit=limit
    )


@router.put("/cross-studio/{grant_id}", response_model=CrossStudioRequestResult)
async def resolve_cross_studio_request(
    grant_id: UUID,
    body: CrossStudioResolveBody,
    session: AsyncSession = Depends(get_db),
    admin: User = Depends(require_tool_admin),
) -> CrossStudioRequestResult:
    result = await CrossStudioService(session).resolve(grant_id, admin, body)
    await session.commit()
    return result


@router.post("/jobs/stale-draft-notifications")
async def run_stale_draft_notifications_admin(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
) -> dict[str, int]:
    from app.services.draft_unpublished_notification_job import (
        run_draft_unpublished_notifications,
    )

    n = await run_draft_unpublished_notifications(session)
    await session.commit()
    return {"notifications_created": n}


@router.get("/token-usage")
async def admin_token_usage(
    request: Request,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
    studio_id: list[UUID] | None = Query(None),
    software_id: list[UUID] | None = Query(None),
    project_id: list[UUID] | None = Query(None),
    work_order_id: list[UUID] | None = Query(None),
    user_id: list[UUID] | None = Query(None),
    call_type: list[str] | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    limit: int = Query(100, ge=1, le=5000),
    offset: int = Query(0, ge=0),
):
    svc = TokenUsageQueryService(session)
    csv_mode = _wants_csv(request)
    lim = 500_000 if csv_mode else limit
    off = 0 if csv_mode else offset
    ct = [c.strip() for c in (call_type or []) if c and c.strip()]
    rows, totals = await svc.list_rows(
        scope="tool_admin",
        scope_studio_id=None,
        scope_user_id=None,
        studio_ids=studio_id,
        software_ids=software_id,
        project_ids=project_id,
        user_ids=user_id,
        call_types=ct or None,
        work_order_ids=work_order_id,
        date_from=date_from,
        date_to=date_to,
        limit=lim,
        offset=off,
    )
    if csv_mode:
        body = svc.rows_to_csv(rows)
        return Response(
            content=body.encode("utf-8"),
            media_type="text/csv",
            headers={
                "Content-Disposition": 'attachment; filename="token-usage.csv"'
            },
        )
    tin, tout, cost = totals
    return TokenUsageReportOut(
        rows=[TokenUsageRowOut.model_validate(r) for r in rows],
        totals=TokenUsageTotalsOut(
            input_tokens=tin,
            output_tokens=tout,
            estimated_cost_usd=cost,
        ),
    )


@router.get("/console/overview", response_model=AdminConsoleOverviewResponse)
async def admin_console_overview(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
) -> AdminConsoleOverviewResponse:
    return await AdminOverviewService(session).overview()


@router.get("/studios", response_model=list[StudioOverviewRowResponse])
async def admin_list_studios(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
) -> list[StudioOverviewRowResponse]:
    return await AdminStudioConsoleService(session).list_studios()


@router.post("/studios", response_model=StudioResponse)
async def admin_create_studio(
    body: StudioCreate,
    session: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_tool_admin),
) -> StudioResponse:
    return await StudioService(session).create_studio(admin_user, body)


@router.get("/studios/{studio_id}", response_model=AdminStudioDetailResponse)
async def admin_get_studio(
    studio_id: UUID,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
    studio: Studio = Depends(get_studio_for_tool_admin),
) -> AdminStudioDetailResponse:
    assert studio.id == studio_id
    return await AdminStudioConsoleService(session).get_studio(studio)


@router.get("/users", response_model=list[AdminUserDirectoryRowResponse])
async def admin_list_users(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> list[AdminUserDirectoryRowResponse]:
    return await AdminUserDirectoryService(session).list_users(limit=limit, offset=offset)


@router.post("/users", response_model=UserPublic, status_code=status.HTTP_201_CREATED)
async def admin_create_user(
    body: UserCreate,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
) -> UserPublic:
    return await AuthService(session).create_user_by_admin(body)


@router.get("/llm/deployment", response_model=LlmDeploymentResponse)
async def get_llm_deployment(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
) -> LlmDeploymentResponse:
    credentials = await AdminService(session).get_public()
    providers = await LlmConnectivityService(session).list_providers()
    return LlmDeploymentResponse(credentials=credentials, providers=providers)


@router.get("/llm/providers", response_model=list[LlmProviderRegistryResponse])
async def list_llm_providers(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
) -> list[LlmProviderRegistryResponse]:
    return await LlmConnectivityService(session).list_providers()


@router.put("/llm/providers/{provider_key}", response_model=LlmProviderRegistryResponse)
async def upsert_llm_provider(
    provider_key: str,
    body: LlmProviderRegistryUpdate,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
) -> LlmProviderRegistryResponse:
    return await LlmConnectivityService(session).upsert_provider(provider_key, body)


@router.delete("/llm/providers/{provider_key}", status_code=204)
async def delete_llm_provider(
    provider_key: str,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
) -> Response:
    await LlmConnectivityService(session).delete_provider(provider_key)
    return Response(status_code=204)


@router.get("/llm/routing", response_model=list[LlmRoutingRuleResponse])
async def get_llm_routing(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
) -> list[LlmRoutingRuleResponse]:
    return await LlmConnectivityService(session).list_routing()


@router.put("/llm/routing", response_model=list[LlmRoutingRuleResponse])
async def put_llm_routing(
    body: LlmRoutingRuleUpdate,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
) -> list[LlmRoutingRuleResponse]:
    return await LlmConnectivityService(session).put_routing(body)


@router.get(
    "/studios/{studio_id}/llm-policy",
    response_model=list[StudioLlmPolicyRowResponse],
)
async def get_studio_llm_policy(
    studio_id: UUID,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
    studio: Studio = Depends(get_studio_for_tool_admin),
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
    _: User = Depends(require_tool_admin),
    studio: Studio = Depends(get_studio_for_tool_admin),
) -> list[StudioLlmPolicyRowResponse]:
    assert studio.id == studio_id
    return await LlmConnectivityService(session).put_studio_policy(studio_id, body)


@router.get("/studios/{studio_id}/gitlab", response_model=StudioGitLabResponse)
async def get_studio_gitlab(
    studio_id: UUID,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
    studio: Studio = Depends(get_studio_for_tool_admin),
) -> StudioGitLabResponse:
    assert studio.id == studio_id
    return await StudioToolAdminService(session).get_gitlab(studio)


@router.patch("/studios/{studio_id}/gitlab", response_model=StudioGitLabResponse)
async def patch_studio_gitlab(
    studio_id: UUID,
    body: StudioGitLabUpdate,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
    studio: Studio = Depends(get_studio_for_tool_admin),
) -> StudioGitLabResponse:
    assert studio.id == studio_id
    return await StudioToolAdminService(session).patch_gitlab(studio, body)


@router.patch("/studios/{studio_id}/budget", status_code=204)
async def patch_studio_budget(
    studio_id: UUID,
    body: StudioToolAdminUpdate,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
    studio: Studio = Depends(get_studio_for_tool_admin),
) -> Response:
    assert studio.id == studio_id
    await StudioToolAdminService(session).patch_budget(studio, body)
    return Response(status_code=204)


@router.get(
    "/studios/{studio_id}/member-budgets",
    response_model=list[MemberBudgetRowResponse],
)
async def list_studio_member_budgets(
    studio_id: UUID,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
    studio: Studio = Depends(get_studio_for_tool_admin),
) -> list[MemberBudgetRowResponse]:
    assert studio.id == studio_id
    return await StudioMemberBudgetAdminService(session).list_member_budgets(studio_id)


@router.patch(
    "/studios/{studio_id}/members/{user_id}/budget",
    response_model=MemberBudgetRowResponse,
)
async def patch_studio_member_budget(
    studio_id: UUID,
    user_id: UUID,
    body: MemberBudgetUpdate,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
    studio: Studio = Depends(get_studio_for_tool_admin),
) -> MemberBudgetRowResponse:
    assert studio.id == studio_id
    return await StudioMemberBudgetAdminService(session).patch_member_budget(
        studio_id, user_id, body
    )


@router.get("/embeddings/library", response_model=list[AdminEmbeddingLibraryStudioResponse])
async def list_embedding_library_overview(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
) -> list[AdminEmbeddingLibraryStudioResponse]:
    return await EmbeddingAdminService(session).library_overview()


@router.get("/embeddings/models", response_model=list[EmbeddingModelRegistryResponse])
async def list_embedding_models(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
) -> list[EmbeddingModelRegistryResponse]:
    return await EmbeddingAdminService(session).list_models()


@router.put("/embeddings/models/{model_id}", response_model=EmbeddingModelRegistryResponse)
async def upsert_embedding_model(
    model_id: str,
    body: EmbeddingModelRegistryUpdate,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
) -> EmbeddingModelRegistryResponse:
    return await EmbeddingAdminService(session).upsert_model(body, model_id=model_id)


@router.delete("/embeddings/models/{model_id}", status_code=204)
async def delete_embedding_model(
    model_id: str,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
) -> Response:
    await EmbeddingAdminService(session).delete_model(model_id)
    return Response(status_code=204)


@router.get("/embeddings/reindex-policy", response_model=EmbeddingReindexPolicyResponse)
async def get_embedding_reindex_policy(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
) -> EmbeddingReindexPolicyResponse:
    return await EmbeddingAdminService(session).get_reindex_policy()


@router.patch("/embeddings/reindex-policy", response_model=EmbeddingReindexPolicyResponse)
async def patch_embedding_reindex_policy(
    body: EmbeddingReindexPolicyUpdate,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
) -> EmbeddingReindexPolicyResponse:
    return await EmbeddingAdminService(session).patch_reindex_policy(body)
