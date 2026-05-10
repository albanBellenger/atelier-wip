"""Aggregated counts for studio list cards (scoped to a set of studio IDs)."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Project, Software, StudioMember


async def aggregate_studio_card_counts(
    db: AsyncSession, studio_ids: list[UUID]
) -> tuple[dict[UUID, int], dict[UUID, int], dict[UUID, int]]:
    """Return (software_count_by_studio, project_count_by_studio, member_count_by_studio)."""
    if not studio_ids:
        return {}, {}, {}

    sw_rows = (
        await db.execute(
            select(Software.studio_id, func.count())
            .where(Software.studio_id.in_(studio_ids))
            .group_by(Software.studio_id)
        )
    ).all()
    sw_map: dict[UUID, int] = {r[0]: int(r[1]) for r in sw_rows}

    proj_rows = (
        await db.execute(
            select(Software.studio_id, func.count())
            .select_from(Project)
            .join(Software, Project.software_id == Software.id)
            .where(Software.studio_id.in_(studio_ids))
            .group_by(Software.studio_id)
        )
    ).all()
    proj_map: dict[UUID, int] = {r[0]: int(r[1]) for r in proj_rows}

    mem_rows = (
        await db.execute(
            select(StudioMember.studio_id, func.count())
            .where(StudioMember.studio_id.in_(studio_ids))
            .group_by(StudioMember.studio_id)
        )
    ).all()
    mem_map: dict[UUID, int] = {r[0]: int(r[1]) for r in mem_rows}

    return sw_map, proj_map, mem_map
