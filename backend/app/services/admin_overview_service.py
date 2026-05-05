"""Aggregates for Admin console Overview."""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    ArtifactChunk,
    StudioMember,
    SectionChunk,
)
from app.schemas.admin_console import (
    AdminConsoleOverviewResponse,
    DeploymentActivityResponse,
    StudioOverviewRowResponse,
)
from app.services.admin_activity_service import AdminActivityService
from app.services.admin_studio_metrics import load_studio_aggregate_maps


class AdminOverviewService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def overview(self) -> AdminConsoleOverviewResponse:
        studios, mtd_map, sw_map, mem_map = await load_studio_aggregate_maps(self.db)
        mtd_total = sum(mtd_map.values(), start=Decimal("0"))

        active_builders = int(
            await self.db.scalar(select(func.count(func.distinct(StudioMember.user_id)))) or 0
        )

        embed_chunks = int(await self.db.scalar(select(func.count()).select_from(ArtifactChunk)) or 0)
        embed_sections = int(await self.db.scalar(select(func.count()).select_from(SectionChunk)) or 0)
        embed_collections = embed_chunks + embed_sections

        studio_rows: list[StudioOverviewRowResponse] = []
        for st in studios:
            studio_rows.append(
                StudioOverviewRowResponse(
                    studio_id=st.id,
                    name=st.name,
                    description=st.description,
                    created_at=st.created_at,
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
            DeploymentActivityResponse.model_validate(r) for r in recent_orm
        ]

        return AdminConsoleOverviewResponse(
            studios=studio_rows,
            mtd_spend_total_usd=mtd_total,
            active_builders_count=active_builders,
            embedding_collection_count=embed_collections,
            recent_activity=recent,
        )
