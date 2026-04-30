"""Routes under ``/me`` (outside ``/auth`` prefix)."""

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas.token_usage_report import (
    TokenUsageReportOut,
    TokenUsageRowOut,
    TokenUsageTotalsOut,
)
from app.services.token_usage_query_service import TokenUsageQueryService

router = APIRouter(tags=["me"])


def _wants_csv(request: Request) -> bool:
    accept = (request.headers.get("accept") or "").lower()
    return "text/csv" in accept


@router.get("/me/token-usage")
async def me_token_usage(
    request: Request,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    software_id: UUID | None = Query(None),
    project_id: UUID | None = Query(None),
    call_type: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    limit: int = Query(100, ge=1, le=5000),
    offset: int = Query(0, ge=0),
):
    svc = TokenUsageQueryService(session)
    csv_mode = _wants_csv(request)
    lim = 500_000 if csv_mode else limit
    off = 0 if csv_mode else offset
    rows, totals = await svc.list_rows(
        scope="self",
        scope_studio_id=None,
        scope_user_id=user.id,
        studio_id=None,
        software_id=software_id,
        project_id=project_id,
        user_id=None,
        call_type=call_type,
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
    return TokenUsageReportOut(
        rows=[TokenUsageRowOut.model_validate(r) for r in rows],
        totals=TokenUsageTotalsOut(
            input_tokens=tin,
            output_tokens=tout,
            estimated_cost_usd=cost,
        ),
    )
