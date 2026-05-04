"""Tool-admin APIs for per-member monthly LLM spend caps within a studio."""

from __future__ import annotations

from datetime import date, datetime, time, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ApiError
from app.models import StudioMember, TokenUsage, User
from app.schemas.admin_console import MemberBudgetPatch, MemberBudgetRowOut


class StudioMemberBudgetAdminService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    @staticmethod
    def _month_start() -> datetime:
        return datetime.combine(
            date.today().replace(day=1),
            time.min,
            tzinfo=timezone.utc,
        )

    async def list_member_budgets(self, studio_id: UUID) -> list[MemberBudgetRowOut]:
        pairs = list(
            (
                await self.db.execute(
                    select(StudioMember, User)
                    .join(User, User.id == StudioMember.user_id)
                    .where(StudioMember.studio_id == studio_id)
                    .order_by(User.email)
                )
            ).all()
        )
        month_start = self._month_start()
        user_ids = [m.user_id for m, _ in pairs]
        spent_map: dict[UUID, Decimal] = {}
        if user_ids:
            sums = (
                (
                    await self.db.execute(
                        select(
                            TokenUsage.user_id,
                            func.coalesce(func.sum(TokenUsage.estimated_cost_usd), 0),
                        ).where(
                            TokenUsage.studio_id == studio_id,
                            TokenUsage.user_id.in_(user_ids),
                            TokenUsage.created_at >= month_start,
                        )
                        .group_by(TokenUsage.user_id)
                    )
                )
                .all()
            )
            for uid, total in sums:
                if uid is not None:
                    spent_map[uid] = Decimal(str(total))

        out: list[MemberBudgetRowOut] = []
        for mem, usr in pairs:
            spend = spent_map.get(mem.user_id, Decimal("0"))
            out.append(
                MemberBudgetRowOut(
                    user_id=mem.user_id,
                    email=usr.email,
                    display_name=usr.display_name,
                    role=mem.role,
                    budget_cap_monthly_usd=mem.budget_cap_monthly_usd,
                    mtd_spend_usd=spend,
                )
            )
        return out

    async def patch_member_budget(
        self,
        studio_id: UUID,
        user_id: UUID,
        body: MemberBudgetPatch,
    ) -> MemberBudgetRowOut:
        row = await self.db.get(StudioMember, (studio_id, user_id))
        if row is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Studio membership not found.",
            )
        row.budget_cap_monthly_usd = body.budget_cap_monthly_usd
        await self.db.flush()
        rows = await self.list_member_budgets(studio_id)
        match = next((r for r in rows if r.user_id == user_id), None)
        assert match is not None
        return match
