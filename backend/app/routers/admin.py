"""Tool admin routes."""

from datetime import date
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Body, Depends, Query, Request
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
    UserPublic,
)
from app.schemas.admin_console import (
    AdminConsoleOverviewOut,
    AdminEmbeddingLibraryStudioOut,
    AdminUserDirectoryRowOut,
    EmbeddingModelRegistryOut,
    EmbeddingModelRegistryUpsert,
    EmbeddingReindexPolicyOut,
    EmbeddingReindexPolicyPatch,
    LlmDeploymentOut,
    LlmProviderRegistryOut,
    LlmProviderRegistryUpsert,
    LlmRoutingRuleOut,
    LlmRoutingRulePatch,
    MemberBudgetPatch,
    MemberBudgetRowOut,
    StudioGitLabOut,
    StudioGitLabPatch,
    StudioLlmPolicyPatch,
    StudioLlmPolicyRowOut,
    StudioToolAdminPatch,
)
from app.schemas.cross_studio import (
    CrossStudioAccessAdminRow,
    CrossStudioResolveBody,
    CrossStudioRequestResult,
)
from app.services.admin_overview_service import AdminOverviewService
from app.services.admin_service import AdminService
from app.services.admin_user_directory_service import AdminUserDirectoryService
from app.services.cross_studio_service import CrossStudioService
from app.services.embedding_admin_service import EmbeddingAdminService
from app.services.llm_connectivity_service import LlmConnectivityService
from app.services.studio_member_budget_admin_service import StudioMemberBudgetAdminService
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


@router.get("/console/overview", response_model=AdminConsoleOverviewOut)
async def admin_console_overview(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
) -> AdminConsoleOverviewOut:
    return await AdminOverviewService(session).overview()


@router.get("/users", response_model=list[AdminUserDirectoryRowOut])
async def admin_list_users(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> list[AdminUserDirectoryRowOut]:
    return await AdminUserDirectoryService(session).list_users(limit=limit, offset=offset)


@router.get("/llm/deployment", response_model=LlmDeploymentOut)
async def get_llm_deployment(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
) -> LlmDeploymentOut:
    credentials = await AdminService(session).get_public()
    providers = await LlmConnectivityService(session).list_providers()
    return LlmDeploymentOut(credentials=credentials, providers=providers)


@router.get("/llm/providers", response_model=list[LlmProviderRegistryOut])
async def list_llm_providers(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
) -> list[LlmProviderRegistryOut]:
    return await LlmConnectivityService(session).list_providers()


@router.put("/llm/providers/{provider_key}", response_model=LlmProviderRegistryOut)
async def upsert_llm_provider(
    provider_key: str,
    body: LlmProviderRegistryUpsert,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
) -> LlmProviderRegistryOut:
    return await LlmConnectivityService(session).upsert_provider(provider_key, body)


@router.delete("/llm/providers/{provider_key}", status_code=204)
async def delete_llm_provider(
    provider_key: str,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
) -> Response:
    await LlmConnectivityService(session).delete_provider(provider_key)
    return Response(status_code=204)


@router.get("/llm/routing", response_model=list[LlmRoutingRuleOut])
async def get_llm_routing(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
) -> list[LlmRoutingRuleOut]:
    return await LlmConnectivityService(session).list_routing()


@router.put("/llm/routing", response_model=list[LlmRoutingRuleOut])
async def put_llm_routing(
    body: LlmRoutingRulePatch,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
) -> list[LlmRoutingRuleOut]:
    return await LlmConnectivityService(session).put_routing(body)


@router.get(
    "/studios/{studio_id}/llm-policy",
    response_model=list[StudioLlmPolicyRowOut],
)
async def get_studio_llm_policy(
    studio_id: UUID,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
    studio: Studio = Depends(get_studio_for_tool_admin),
) -> list[StudioLlmPolicyRowOut]:
    assert studio.id == studio_id
    return await LlmConnectivityService(session).get_studio_policy(studio_id)


@router.put(
    "/studios/{studio_id}/llm-policy",
    response_model=list[StudioLlmPolicyRowOut],
)
async def put_studio_llm_policy(
    studio_id: UUID,
    body: StudioLlmPolicyPatch,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
    studio: Studio = Depends(get_studio_for_tool_admin),
) -> list[StudioLlmPolicyRowOut]:
    assert studio.id == studio_id
    return await LlmConnectivityService(session).put_studio_policy(studio_id, body)


@router.get("/studios/{studio_id}/gitlab", response_model=StudioGitLabOut)
async def get_studio_gitlab(
    studio_id: UUID,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
    studio: Studio = Depends(get_studio_for_tool_admin),
) -> StudioGitLabOut:
    assert studio.id == studio_id
    return await StudioToolAdminService(session).get_gitlab(studio)


@router.patch("/studios/{studio_id}/gitlab", response_model=StudioGitLabOut)
async def patch_studio_gitlab(
    studio_id: UUID,
    body: StudioGitLabPatch,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
    studio: Studio = Depends(get_studio_for_tool_admin),
) -> StudioGitLabOut:
    assert studio.id == studio_id
    return await StudioToolAdminService(session).patch_gitlab(studio, body)


@router.patch("/studios/{studio_id}/budget", status_code=204)
async def patch_studio_budget(
    studio_id: UUID,
    body: StudioToolAdminPatch,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
    studio: Studio = Depends(get_studio_for_tool_admin),
) -> Response:
    assert studio.id == studio_id
    await StudioToolAdminService(session).patch_budget(studio, body)
    return Response(status_code=204)


@router.get(
    "/studios/{studio_id}/member-budgets",
    response_model=list[MemberBudgetRowOut],
)
async def list_studio_member_budgets(
    studio_id: UUID,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
    studio: Studio = Depends(get_studio_for_tool_admin),
) -> list[MemberBudgetRowOut]:
    assert studio.id == studio_id
    return await StudioMemberBudgetAdminService(session).list_member_budgets(studio_id)


@router.patch(
    "/studios/{studio_id}/members/{user_id}/budget",
    response_model=MemberBudgetRowOut,
)
async def patch_studio_member_budget(
    studio_id: UUID,
    user_id: UUID,
    body: MemberBudgetPatch,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
    studio: Studio = Depends(get_studio_for_tool_admin),
) -> MemberBudgetRowOut:
    assert studio.id == studio_id
    return await StudioMemberBudgetAdminService(session).patch_member_budget(
        studio_id, user_id, body
    )


@router.get("/embeddings/library", response_model=list[AdminEmbeddingLibraryStudioOut])
async def list_embedding_library_overview(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
) -> list[AdminEmbeddingLibraryStudioOut]:
    return await EmbeddingAdminService(session).library_overview()


@router.get("/embeddings/models", response_model=list[EmbeddingModelRegistryOut])
async def list_embedding_models(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
) -> list[EmbeddingModelRegistryOut]:
    return await EmbeddingAdminService(session).list_models()


@router.put("/embeddings/models/{model_id}", response_model=EmbeddingModelRegistryOut)
async def upsert_embedding_model(
    model_id: str,
    body: EmbeddingModelRegistryUpsert,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
) -> EmbeddingModelRegistryOut:
    return await EmbeddingAdminService(session).upsert_model(body, model_id=model_id)


@router.delete("/embeddings/models/{model_id}", status_code=204)
async def delete_embedding_model(
    model_id: str,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
) -> Response:
    await EmbeddingAdminService(session).delete_model(model_id)
    return Response(status_code=204)


@router.get("/embeddings/reindex-policy", response_model=EmbeddingReindexPolicyOut)
async def get_embedding_reindex_policy(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
) -> EmbeddingReindexPolicyOut:
    return await EmbeddingAdminService(session).get_reindex_policy()


@router.patch("/embeddings/reindex-policy", response_model=EmbeddingReindexPolicyOut)
async def patch_embedding_reindex_policy(
    body: EmbeddingReindexPolicyPatch,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
) -> EmbeddingReindexPolicyOut:
    return await EmbeddingAdminService(session).patch_reindex_policy(body)
