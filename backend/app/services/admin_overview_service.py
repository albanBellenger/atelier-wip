"""Aggregates for Admin console Overview."""

from __future__ import annotations

from datetime import date, datetime, time, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    ArtifactChunk,
    Software,
    Studio,
    StudioMember,
    TokenUsage,
    SectionChunk,
)
from app.schemas.admin_console import (
    AdminConsoleOverviewOut,
    DeploymentActivityOut,
    StudioOverviewRowOut,
)
from app.services.admin_activity_service import AdminActivityService


class AdminOverviewService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def overview(self) -> AdminConsoleOverviewOut:
        month_start = datetime.combine(
            date.today().replace(day=1),
            time.min,
            tzinfo=timezone.utc,
        )
        studios = list((await self.db.execute(select(Studio))).scalars().all())
        studio_ids = [s.id for s in studios]

        mtd_cond = TokenUsage.created_at >= month_start
        if studio_ids:
            mtd_part = (
                select(TokenUsage.studio_id, func.coalesce(func.sum(TokenUsage.estimated_cost_usd), 0))
                .where(mtd_cond)
                .where(TokenUsage.studio_id.in_(studio_ids))
                .group_by(TokenUsage.studio_id)
            )
            mtd_rows = (await self.db.execute(mtd_part)).all()
        else:
            mtd_rows = []
        mtd_map: dict[UUID, Decimal] = {}
        for sid, total in mtd_rows:
            if sid is None:
                continue
            mtd_map[sid] = Decimal(str(total))

        sw_counts = (
            (
                await self.db.execute(
                    select(Software.studio_id, func.count())
                    .where(Software.studio_id.in_(studio_ids))
                    .group_by(Software.studio_id)
                )
            )
            .all()
            if studio_ids
            else []
        )
        sw_map = {r[0]: int(r[1]) for r in sw_counts}

        mem_counts = (
            (
                await self.db.execute(
                    select(StudioMember.studio_id, func.count()).group_by(StudioMember.studio_id)
                )
            )
            .all()
            if studio_ids
            else []
        )
        mem_map = {r[0]: int(r[1]) for r in mem_counts}

        mtd_total = sum(mtd_map.values(), start=Decimal("0"))

        active_builders = int(
            await self.db.scalar(select(func.count(func.distinct(StudioMember.user_id)))) or 0
        )

        embed_chunks = int(await self.db.scalar(select(func.count()).select_from(ArtifactChunk)) or 0)
        embed_sections = int(await self.db.scalar(select(func.count()).select_from(SectionChunk)) or 0)
        embed_collections = embed_chunks + embed_sections

        studio_rows: list[StudioOverviewRowOut] = []
        for st in studios:
            studio_rows.append(
                StudioOverviewRowOut(
                    studio_id=st.id,
                    name=st.name,
                    software_count=sw_map.get(st.id, 0),
                    member_count=mem_map.get(st.id, 0),
                    mtd_spend_usd=mtd_map.get(st.id, Decimal("0")),
                    budget_cap_monthly_usd=st.budget_cap_monthly_usd,
                    budget_overage_action=st.budget_overage_action,
                )
            )

        act_svc = AdminActivityService(self.db)
        recent_orm, _ = await act_svc.list_recent(limit=12, offset=0)
        recent = [
            DeploymentActivityOut.model_validate(r) for r in recent_orm
        ]

        return AdminConsoleOverviewOut(
            studios=studio_rows,
            mtd_spend_total_usd=mtd_total,
            active_builders_count=active_builders,
            embedding_collection_count=embed_collections,
            recent_activity=recent,
        )
