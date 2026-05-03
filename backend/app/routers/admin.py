"""Tool admin routes."""

from datetime import date
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import require_tool_admin
from app.models import User
from app.schemas.auth import (
    AdminConfigResponse,
    AdminConfigUpdate,
    AdminConnectivityResult,
    AdminStatusUpdate,
    UserPublic,
)
from app.schemas.cross_studio import (
    CrossStudioAccessAdminRow,
    CrossStudioResolveBody,
    CrossStudioRequestResult,
)
from app.services.admin_service import AdminService
from app.services.cross_studio_service import CrossStudioService
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
    _: User = Depends(require_tool_admin),
) -> AdminConfigResponse:
    return await AdminService(session).update(body, background_tasks)


@router.post("/test/llm", response_model=AdminConnectivityResult)
async def test_admin_llm(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
) -> AdminConnectivityResult:
    return await AdminService(session).test_llm()


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
