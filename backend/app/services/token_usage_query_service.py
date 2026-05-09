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

from app.models import Project, Software, Studio, TokenUsage, User, WorkOrder
from app.schemas.token_usage_report import TokenUsageRowOut

Scope = Literal["platform_admin", "studio", "self"]


def _non_empty(ids: list[UUID] | None) -> list[UUID] | None:
    if ids is None:
        return None
    return ids if ids else None


class TokenUsageQueryService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    def _conditions(
        self,
        *,
        scope: Scope,
        scope_studio_id: UUID | None,
        scope_user_id: UUID | None,
        studio_ids: list[UUID] | None,
        software_ids: list[UUID] | None,
        project_ids: list[UUID] | None,
        user_ids: list[UUID] | None,
        call_sources: list[str] | None,
        work_order_ids: list[UUID] | None,
        date_from: date | None,
        date_to: date | None,
    ) -> list[Any]:
        conds: list[Any] = []
        if scope == "self":
            conds.append(TokenUsage.user_id == scope_user_id)
        elif scope == "studio":
            conds.append(TokenUsage.studio_id == scope_studio_id)
        sid = _non_empty(studio_ids)
        if sid is not None:
            conds.append(TokenUsage.studio_id.in_(sid))
        sw = _non_empty(software_ids)
        if sw is not None:
            conds.append(TokenUsage.software_id.in_(sw))
        pj = _non_empty(project_ids)
        if pj is not None:
            conds.append(TokenUsage.project_id.in_(pj))
        uid = _non_empty(user_ids)
        if uid is not None:
            conds.append(TokenUsage.user_id.in_(uid))
        ct_list = [str(c).strip() for c in (call_sources or []) if str(c).strip()]
        if len(ct_list) == 1:
            conds.append(TokenUsage.call_source == ct_list[0][:32])
        elif len(ct_list) > 1:
            conds.append(TokenUsage.call_source.in_([c[:32] for c in ct_list]))
        wo = _non_empty(work_order_ids)
        if wo is not None:
            conds.append(TokenUsage.work_order_id.in_(wo))
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
        studio_ids: list[UUID] | None,
        software_ids: list[UUID] | None,
        project_ids: list[UUID] | None,
        user_ids: list[UUID] | None,
        call_sources: list[str] | None,
        work_order_ids: list[UUID] | None,
        date_from: date | None,
        date_to: date | None,
    ) -> tuple[int, int, Decimal]:
        conds = self._conditions(
            scope=scope,
            scope_studio_id=scope_studio_id,
            scope_user_id=scope_user_id,
            studio_ids=studio_ids,
            software_ids=software_ids,
            project_ids=project_ids,
            user_ids=user_ids,
            call_sources=call_sources,
            work_order_ids=work_order_ids,
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
        studio_ids: list[UUID] | None,
        software_ids: list[UUID] | None,
        project_ids: list[UUID] | None,
        user_ids: list[UUID] | None,
        call_sources: list[str] | None,
        work_order_ids: list[UUID] | None,
        date_from: date | None,
        date_to: date | None,
        limit: int,
        offset: int,
    ) -> tuple[list[TokenUsage], tuple[int, int, Decimal]]:
        conds = self._conditions(
            scope=scope,
            scope_studio_id=scope_studio_id,
            scope_user_id=scope_user_id,
            studio_ids=studio_ids,
            software_ids=software_ids,
            project_ids=project_ids,
            user_ids=user_ids,
            call_sources=call_sources,
            work_order_ids=work_order_ids,
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
            studio_ids=studio_ids,
            software_ids=software_ids,
            project_ids=project_ids,
            user_ids=user_ids,
            call_sources=call_sources,
            work_order_ids=work_order_ids,
            date_from=date_from,
            date_to=date_to,
        )
        return rows, totals

    async def enrich_rows_for_report(self, rows: list[TokenUsage]) -> list[TokenUsageRowOut]:
        """Resolve studio/software/project/work-order/user labels for dashboard rows."""
        if not rows:
            return []

        studio_ids = {r.studio_id for r in rows if r.studio_id is not None}
        software_ids = {r.software_id for r in rows if r.software_id is not None}
        project_ids = {r.project_id for r in rows if r.project_id is not None}
        work_order_ids = {r.work_order_id for r in rows if r.work_order_id is not None}
        user_ids = {r.user_id for r in rows if r.user_id is not None}

        studio_map: dict[UUID, str] = {}
        if studio_ids:
            res = await self.db.execute(
                select(Studio.id, Studio.name).where(Studio.id.in_(studio_ids))
            )
            studio_map = {row[0]: row[1] for row in res.all()}

        software_map: dict[UUID, str] = {}
        if software_ids:
            res = await self.db.execute(
                select(Software.id, Software.name).where(Software.id.in_(software_ids))
            )
            software_map = {row[0]: row[1] for row in res.all()}

        project_map: dict[UUID, str] = {}
        if project_ids:
            res = await self.db.execute(
                select(Project.id, Project.name).where(Project.id.in_(project_ids))
            )
            project_map = {row[0]: row[1] for row in res.all()}

        work_order_map: dict[UUID, str] = {}
        if work_order_ids:
            res = await self.db.execute(
                select(WorkOrder.id, WorkOrder.title).where(WorkOrder.id.in_(work_order_ids))
            )
            work_order_map = {row[0]: row[1] for row in res.all()}

        user_map: dict[UUID, str] = {}
        if user_ids:
            res = await self.db.execute(
                select(User.id, User.display_name).where(User.id.in_(user_ids))
            )
            user_map = {row[0]: row[1] for row in res.all()}

        out: list[TokenUsageRowOut] = []
        for r in rows:
            base = TokenUsageRowOut.model_validate(r)
            sid = r.studio_id
            swid = r.software_id
            pid = r.project_id
            woid = r.work_order_id
            uid = r.user_id
            out.append(
                base.model_copy(
                    update={
                        "studio_name": studio_map.get(sid) if sid is not None else None,
                        "software_name": software_map.get(swid) if swid is not None else None,
                        "project_name": project_map.get(pid) if pid is not None else None,
                        "work_order_title": work_order_map.get(woid) if woid is not None else None,
                        "user_display_name": user_map.get(uid) if uid is not None else None,
                    }
                )
            )
        return out

    def rows_to_csv(self, rows: list[TokenUsageRowOut]) -> str:
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(
            [
                "id",
                "studio_id",
                "studio_name",
                "software_id",
                "software_name",
                "project_id",
                "project_name",
                "work_order_id",
                "work_order_title",
                "user_id",
                "user_display_name",
                "call_source",
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
                    r.studio_name or "",
                    str(r.software_id) if r.software_id else "",
                    r.software_name or "",
                    str(r.project_id) if r.project_id else "",
                    r.project_name or "",
                    str(r.work_order_id) if r.work_order_id else "",
                    r.work_order_title or "",
                    str(r.user_id) if r.user_id else "",
                    r.user_display_name or "",
                    r.call_source,
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
