"""Shared studio aggregate queries for admin overview and admin studio console."""

from __future__ import annotations

from datetime import date, datetime, time, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Software, Studio, StudioMember, TokenUsage


def month_start_utc() -> datetime:
    return datetime.combine(
        date.today().replace(day=1),
        time.min,
        tzinfo=timezone.utc,
    )


async def load_studio_aggregate_maps(
    db: AsyncSession,
) -> tuple[list[Studio], dict[UUID, Decimal], dict[UUID, int], dict[UUID, int]]:
    studios = list((await db.execute(select(Studio))).scalars().all())
    studio_ids = [s.id for s in studios]
    month_start = month_start_utc()

    mtd_map: dict[UUID, Decimal] = {}
    if studio_ids:
        mtd_cond = TokenUsage.created_at >= month_start
        mtd_part = (
            select(
                TokenUsage.studio_id,
                func.coalesce(func.sum(TokenUsage.estimated_cost_usd), 0),
            )
            .where(mtd_cond)
            .where(TokenUsage.studio_id.in_(studio_ids))
            .group_by(TokenUsage.studio_id)
        )
        for sid, total in (await db.execute(mtd_part)).all():
            if sid is not None:
                mtd_map[sid] = Decimal(str(total))

    sw_map: dict[UUID, int] = {}
    if studio_ids:
        sw_rows = (
            await db.execute(
                select(Software.studio_id, func.count())
                .where(Software.studio_id.in_(studio_ids))
                .group_by(Software.studio_id)
            )
        ).all()
        sw_map = {r[0]: int(r[1]) for r in sw_rows}

    mem_map: dict[UUID, int] = {}
    if studio_ids:
        mem_rows = (
            await db.execute(
                select(StudioMember.studio_id, func.count()).group_by(
                    StudioMember.studio_id
                )
            )
        ).all()
        mem_map = {r[0]: int(r[1]) for r in mem_rows}

    return studios, mtd_map, sw_map, mem_map


async def metrics_for_studio(
    db: AsyncSession,
    studio_id: UUID,
    month_start: datetime,
) -> tuple[int, int, Decimal]:
    sw = int(
        await db.scalar(
            select(func.count()).select_from(Software).where(
                Software.studio_id == studio_id
            )
        )
        or 0
    )
    mem = int(
        await db.scalar(
            select(func.count())
            .select_from(StudioMember)
            .where(StudioMember.studio_id == studio_id)
        )
        or 0
    )
    mtd_cond = TokenUsage.created_at >= month_start
    mtd_raw = await db.scalar(
        select(func.coalesce(func.sum(TokenUsage.estimated_cost_usd), 0)).where(
            TokenUsage.studio_id == studio_id,
            mtd_cond,
        )
    )
    mtd = Decimal(str(mtd_raw or 0))
    return sw, mem, mtd
