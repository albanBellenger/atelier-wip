"""Token usage reporting (aggregates ``token_usage`` rows)."""

from __future__ import annotations

import csv
import io
from datetime import date, datetime, time, timezone
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import TokenUsage

Scope = Literal["tool_admin", "studio", "self"]


class TokenUsageQueryService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    def _conditions(
        self,
        *,
        scope: Scope,
        scope_studio_id: UUID | None,
        scope_user_id: UUID | None,
        studio_id: UUID | None,
        software_id: UUID | None,
        project_id: UUID | None,
        user_id: UUID | None,
        call_type: str | None,
        date_from: date | None,
        date_to: date | None,
    ) -> list[Any]:
        conds: list[Any] = []
        if scope == "self":
            conds.append(TokenUsage.user_id == scope_user_id)
        elif scope == "studio":
            conds.append(TokenUsage.studio_id == scope_studio_id)
        if studio_id is not None:
            conds.append(TokenUsage.studio_id == studio_id)
        if software_id is not None:
            conds.append(TokenUsage.software_id == software_id)
        if project_id is not None:
            conds.append(TokenUsage.project_id == project_id)
        if user_id is not None:
            conds.append(TokenUsage.user_id == user_id)
        if call_type:
            conds.append(TokenUsage.call_type == call_type)
        if date_from is not None:
            start = datetime.combine(date_from, time.min, tzinfo=timezone.utc)
            conds.append(TokenUsage.created_at >= start)
        if date_to is not None:
            end = datetime.combine(date_to, time.max, tzinfo=timezone.utc)
            conds.append(TokenUsage.created_at <= end)
        return conds

    async def totals_for_filtered(
        self,
        *,
        scope: Scope,
        scope_studio_id: UUID | None,
        scope_user_id: UUID | None,
        studio_id: UUID | None,
        software_id: UUID | None,
        project_id: UUID | None,
        user_id: UUID | None,
        call_type: str | None,
        date_from: date | None,
        date_to: date | None,
    ) -> tuple[int, int, Decimal]:
        conds = self._conditions(
            scope=scope,
            scope_studio_id=scope_studio_id,
            scope_user_id=scope_user_id,
            studio_id=studio_id,
            software_id=software_id,
            project_id=project_id,
            user_id=user_id,
            call_type=call_type,
            date_from=date_from,
            date_to=date_to,
        )
        sum_stmt = select(
            func.coalesce(func.sum(TokenUsage.input_tokens), 0),
            func.coalesce(func.sum(TokenUsage.output_tokens), 0),
            func.coalesce(func.sum(TokenUsage.estimated_cost_usd), 0),
        )
        if conds:
            sum_stmt = sum_stmt.where(*conds)
        row = (await self.db.execute(sum_stmt)).one()
        tin = int(row[0] or 0)
        tout = int(row[1] or 0)
        cost_raw = row[2]
        cost: Decimal
        if cost_raw is None:
            cost = Decimal("0")
        else:
            cost = Decimal(str(cost_raw))
        return tin, tout, cost

    async def list_rows(
        self,
        *,
        scope: Scope,
        scope_studio_id: UUID | None,
        scope_user_id: UUID | None,
        studio_id: UUID | None,
        software_id: UUID | None,
        project_id: UUID | None,
        user_id: UUID | None,
        call_type: str | None,
        date_from: date | None,
        date_to: date | None,
        limit: int,
        offset: int,
    ) -> tuple[list[TokenUsage], tuple[int, int, Decimal]]:
        conds = self._conditions(
            scope=scope,
            scope_studio_id=scope_studio_id,
            scope_user_id=scope_user_id,
            studio_id=studio_id,
            software_id=software_id,
            project_id=project_id,
            user_id=user_id,
            call_type=call_type,
            date_from=date_from,
            date_to=date_to,
        )
        stmt = select(TokenUsage)
        if conds:
            stmt = stmt.where(*conds)
        stmt = stmt.order_by(TokenUsage.created_at.desc()).limit(limit).offset(offset)
        rows = list((await self.db.execute(stmt)).scalars().all())
        totals = await self.totals_for_filtered(
            scope=scope,
            scope_studio_id=scope_studio_id,
            scope_user_id=scope_user_id,
            studio_id=studio_id,
            software_id=software_id,
            project_id=project_id,
            user_id=user_id,
            call_type=call_type,
            date_from=date_from,
            date_to=date_to,
        )
        return rows, totals

    def rows_to_csv(self, rows: list[TokenUsage]) -> str:
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(
            [
                "id",
                "studio_id",
                "software_id",
                "project_id",
                "user_id",
                "call_type",
                "model",
                "input_tokens",
                "output_tokens",
                "estimated_cost_usd",
                "created_at",
            ]
        )
        for r in rows:
            w.writerow(
                [
                    str(r.id),
                    str(r.studio_id) if r.studio_id else "",
                    str(r.software_id) if r.software_id else "",
                    str(r.project_id) if r.project_id else "",
                    str(r.user_id) if r.user_id else "",
                    r.call_type,
                    r.model,
                    r.input_tokens,
                    r.output_tokens,
                    str(r.estimated_cost_usd)
                    if r.estimated_cost_usd is not None
                    else "",
                    r.created_at.isoformat() if r.created_at else "",
                ]
            )
        return buf.getvalue()
