"""Routes under ``/me`` (outside ``/auth`` prefix)."""

from datetime import date, datetime, time, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user, resolve_studio_access_for_software
from app.exceptions import ApiError
from app.models import Project, Studio, StudioMember, TokenUsage, User, WorkOrder
from app.schemas.token_usage_report import (
    BudgetMonthStatusOut,
    MeTokenUsageBuilderBudgetOut,
    TokenUsageReportOut,
    TokenUsageRowOut,
    TokenUsageTotalsOut,
)
from app.services.budget_month_status import compute_builder_budget_status
from app.services.token_usage_query_service import TokenUsageQueryService

router = APIRouter(tags=["me"])


def _wants_csv(request: Request) -> bool:
    accept = (request.headers.get("accept") or "").lower()
    return "text/csv" in accept


def _dedupe_ids(ids: list[UUID] | None) -> list[UUID] | None:
    if ids is None:
        return None
    out: list[UUID] = []
    seen: set[UUID] = set()
    for u in ids:
        if u not in seen:
            seen.add(u)
            out.append(u)
    return out


async def _ensure_token_usage_eligible(session: AsyncSession, user: User) -> None:
    memberships = (
        await session.execute(
            select(StudioMember).where(StudioMember.user_id == user.id).limit(1)
        )
    ).scalar_one_or_none()
    if memberships is None and not user.is_tool_admin:
        raise ApiError(
            status_code=403,
            code="FORBIDDEN",
            message="Viewer access does not include token usage.",
        )


async def _validate_studio_filters(
    session: AsyncSession, user: User, studio_ids: list[UUID] | None
) -> None:
    if not studio_ids:
        return
    for studio_id in studio_ids:
        st = await session.get(Studio, studio_id)
        if st is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Studio not found.",
            )
        if user.is_tool_admin:
            continue
        row = (
            await session.execute(
                select(StudioMember).where(
                    StudioMember.studio_id == studio_id,
                    StudioMember.user_id == user.id,
                )
            )
        ).scalar_one_or_none()
        if row is None:
            raise ApiError(
                status_code=403,
                code="FORBIDDEN",
                message="Not a member of this studio.",
            )


async def _validate_software_filters(
    session: AsyncSession, user: User, software_ids: list[UUID] | None
) -> None:
    if not software_ids:
        return
    from app.models import Software

    for sw_id in software_ids:
        sw = await session.get(Software, sw_id)
        if sw is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Software not found.",
            )
        await resolve_studio_access_for_software(session, user, sw)


async def _validate_project_filters(
    session: AsyncSession, user: User, project_ids: list[UUID] | None
) -> None:
    if not project_ids:
        return
    from app.models import Software

    for pid in project_ids:
        pr = await session.get(Project, pid)
        if pr is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Project not found.",
            )
        sw = await session.get(Software, pr.software_id)
        if sw is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Software not found.",
            )
        await resolve_studio_access_for_software(session, user, sw)


async def _validate_work_order_filters(
    session: AsyncSession, user: User, work_order_ids: list[UUID] | None
) -> None:
    if not work_order_ids:
        return
    from app.models import Software

    for woid in work_order_ids:
        wo = await session.get(WorkOrder, woid)
        if wo is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Work order not found.",
            )
        pr = await session.get(Project, wo.project_id)
        if pr is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Project not found.",
            )
        sw = await session.get(Software, pr.software_id)
        if sw is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Software not found.",
            )
        await resolve_studio_access_for_software(session, user, sw)


@router.get("/me/token-usage")
async def me_token_usage(
    request: Request,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    studio_id: list[UUID] | None = Query(None),
    software_id: list[UUID] | None = Query(None),
    project_id: list[UUID] | None = Query(None),
    work_order_id: list[UUID] | None = Query(None),
    call_type: list[str] | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    budget_studio_id: UUID | None = Query(
        None,
        description=(
            "When set, include ``builder_budget``: this month's estimated spend "
            "for you in that studio vs your per-member monthly USD cap."
        ),
    ),
    limit: int = Query(100, ge=1, le=5000),
    offset: int = Query(0, ge=0),
):
    await _ensure_token_usage_eligible(session, user)

    studio_ids = _dedupe_ids(studio_id)
    software_ids = _dedupe_ids(software_id)
    project_ids = _dedupe_ids(project_id)
    work_order_ids = _dedupe_ids(work_order_id)
    call_types_raw = call_type or []
    call_types_param = [
        c.strip() for c in call_types_raw if c and str(c).strip()
    ] or None

    await _validate_studio_filters(session, user, studio_ids)
    await _validate_software_filters(session, user, software_ids)
    await _validate_project_filters(session, user, project_ids)
    await _validate_work_order_filters(session, user, work_order_ids)

    svc = TokenUsageQueryService(session)
    csv_mode = _wants_csv(request)
    lim = 500_000 if csv_mode else limit
    off = 0 if csv_mode else offset
    rows, totals = await svc.list_rows(
        scope="self",
        scope_studio_id=None,
        scope_user_id=user.id,
        studio_ids=studio_ids,
        software_ids=software_ids,
        project_ids=project_ids,
        user_ids=None,
        call_types=call_types_param,
        work_order_ids=work_order_ids,
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
                "Content-Disposition": 'attachment; filename="my-token-usage.csv"'
            },
        )
    tin, tout, cost = totals
    builder_budget_out: MeTokenUsageBuilderBudgetOut | None = None
    if budget_studio_id is not None:
        await _validate_studio_filters(session, user, [budget_studio_id])
        mem = await session.get(StudioMember, (budget_studio_id, user.id))
        cap_val: Decimal | None = (
            mem.budget_cap_monthly_usd if mem is not None else None
        )
        month_start = datetime.combine(
            date.today().replace(day=1),
            time.min,
            tzinfo=timezone.utc,
        )
        spent_raw = await session.scalar(
            select(func.coalesce(func.sum(TokenUsage.estimated_cost_usd), 0)).where(
                TokenUsage.studio_id == budget_studio_id,
                TokenUsage.user_id == user.id,
                TokenUsage.created_at >= month_start,
            )
        )
        spent_val = Decimal(str(spent_raw or 0))
        builder_budget_out = MeTokenUsageBuilderBudgetOut(
            studio_id=budget_studio_id,
            cap_monthly_usd=cap_val,
            spent_monthly_usd=spent_val,
            budget_status=BudgetMonthStatusOut.model_validate(
                compute_builder_budget_status(spent_val, cap_val)
            ),
        )
    return TokenUsageReportOut(
        rows=[TokenUsageRowOut.model_validate(r) for r in rows],
        totals=TokenUsageTotalsOut(
            input_tokens=tin,
            output_tokens=tout,
            estimated_cost_usd=cost,
        ),
        builder_budget=builder_budget_out,
    )
