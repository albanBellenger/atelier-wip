"""Tool-admin studio list and detail for the admin console."""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Studio
from app.schemas.admin_console import AdminStudioDetailResponse, StudioOverviewRowResponse
from app.services.admin_studio_metrics import (
    load_studio_aggregate_maps,
    metrics_for_studio,
    month_start_utc,
)
from app.services.studio_tool_admin_service import StudioToolAdminService


class AdminStudioConsoleService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list_studios(self) -> list[StudioOverviewRowResponse]:
        studios, mtd_map, sw_map, mem_map = await load_studio_aggregate_maps(self.db)
        return [
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
            for st in studios
        ]

    async def get_studio(self, studio: Studio) -> AdminStudioDetailResponse:
        ms = month_start_utc()
        sw, mem, mtd = await metrics_for_studio(self.db, studio.id, ms)
        gitlab = await StudioToolAdminService(self.db).get_gitlab(studio)
        return AdminStudioDetailResponse(
            id=studio.id,
            name=studio.name,
            description=studio.description,
            logo_path=studio.logo_path,
            created_at=studio.created_at,
            budget_cap_monthly_usd=studio.budget_cap_monthly_usd,
            budget_overage_action=studio.budget_overage_action,
            software_count=sw,
            member_count=mem,
            mtd_spend_usd=mtd,
            gitlab=gitlab,
        )
