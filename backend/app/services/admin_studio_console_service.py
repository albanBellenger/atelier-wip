"""Tool-admin studio list and detail for the admin console."""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Studio
from app.schemas.admin_console import AdminStudioDetailResponse, StudioOverviewRowResponse
from app.schemas.token_usage_report import BudgetMonthStatusOut
from app.services.admin_studio_metrics import (
    load_studio_aggregate_maps,
    metrics_for_studio,
    month_start_utc,
)
from app.services.budget_month_status import compute_studio_budget_status
from app.services.studio_tool_admin_service import StudioToolAdminService


class AdminStudioConsoleService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list_studios(self) -> list[StudioOverviewRowResponse]:
        studios, mtd_map, sw_map, mem_map = await load_studio_aggregate_maps(self.db)
        out: list[StudioOverviewRowResponse] = []
        for st in studios:
            mtd = mtd_map.get(st.id, Decimal("0"))
            budget_status = BudgetMonthStatusOut.model_validate(
                compute_studio_budget_status(
                    mtd,
                    st.budget_cap_monthly_usd,
                    st.budget_overage_action,
                )
            )
            out.append(
                StudioOverviewRowResponse(
                    studio_id=st.id,
                    name=st.name,
                    description=st.description,
                    created_at=st.created_at,
                    software_count=sw_map.get(st.id, 0),
                    member_count=mem_map.get(st.id, 0),
                    mtd_spend_usd=mtd,
                    budget_cap_monthly_usd=st.budget_cap_monthly_usd,
                    budget_overage_action=st.budget_overage_action,
                    budget_status=budget_status,
                )
            )
        return out

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
