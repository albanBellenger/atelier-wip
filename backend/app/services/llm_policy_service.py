"""Resolve effective LLM model from routing + per-studio policy + provider registry."""

from __future__ import annotations

import json
from datetime import date, datetime, time, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ApiError
from app.models import (
    AdminConfig,
    LlmProviderRegistry,
    LlmRoutingRule,
    Studio,
    StudioLlmProviderPolicy,
    StudioMember,
    TokenUsage,
)
from app.schemas.studio_budget_overage import StudioBudgetOverageAction


def use_case_for_call_type(call_type: str) -> str:
    """Map token_usage call_type to a routing use_case key."""
    ct = (call_type or "chat").lower()
    if ct in ("work_order_gen", "work_order", "mcp", "mcp_wo"):
        return "code_gen"
    if ct in ("drift", "section_drift"):
        return "classification"
    if "embed" in ct:
        return "embeddings"
    return "chat"


class LlmPolicyService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def resolve_effective_model(
        self,
        *,
        studio_id: UUID,
        call_type: str,
    ) -> str | None:
        """Return override model id or None to use AdminConfig.llm_model."""
        use_case = use_case_for_call_type(call_type)
        reg_count = await self.db.scalar(
            select(func.count()).select_from(LlmProviderRegistry)
        )
        if not reg_count:
            return None

        routing = await self.db.get(LlmRoutingRule, use_case)
        if routing is None:
            routing = await self.db.get(LlmRoutingRule, "chat")
        if routing is None:
            return None

        candidates: list[str] = []
        if routing.primary_model.strip():
            candidates.append(routing.primary_model.strip())
        if routing.fallback_model and routing.fallback_model.strip():
            candidates.append(routing.fallback_model.strip())

        providers = list(
            (await self.db.execute(select(LlmProviderRegistry))).scalars().all()
        )
        policy_rows = list(
            (
                await self.db.execute(
                    select(StudioLlmProviderPolicy).where(
                        StudioLlmProviderPolicy.studio_id == studio_id
                    )
                )
            )
            .scalars()
            .all()
        )
        policy_map = {p.provider_key: p for p in policy_rows}
        has_any_policy = len(policy_rows) > 0

        def provider_for_model(model_name: str) -> str | None:
            for pr in providers:
                try:
                    models = json.loads(pr.models_json or "[]")
                except json.JSONDecodeError:
                    models = []
                if model_name in models:
                    return pr.provider_key
            return None

        for cand in candidates:
            pk = provider_for_model(cand)
            if pk is None:
                continue
            pol = policy_map.get(pk)
            if has_any_policy:
                if pol is None or not pol.enabled:
                    continue
                if pol.selected_model != cand:
                    continue
            else:
                # Registry populated but studio not configured yet — allow routing candidate.
                pass
            return cand
        return None

    async def assert_studio_budget(self, studio_id: UUID) -> None:
        st = await self.db.get(Studio, studio_id)
        if st is None or st.budget_cap_monthly_usd is None:
            return
        cap: Decimal = st.budget_cap_monthly_usd
        month_start = datetime.combine(
            date.today().replace(day=1),
            time.min,
            tzinfo=timezone.utc,
        )
        spent = await self.db.scalar(
            select(func.coalesce(func.sum(TokenUsage.estimated_cost_usd), 0)).where(
                TokenUsage.studio_id == studio_id,
                TokenUsage.created_at >= month_start,
            )
        )
        spent_dec = Decimal(str(spent or 0))
        if spent_dec <= cap:
            return
        raw = (st.budget_overage_action or "").strip() or StudioBudgetOverageAction.PAUSE_GENERATIONS.value
        try:
            action = StudioBudgetOverageAction(raw)
        except ValueError:
            action = StudioBudgetOverageAction.PAUSE_GENERATIONS
        if action in (
            StudioBudgetOverageAction.ALLOW_ALERT_STUDIO_ADMIN,
            StudioBudgetOverageAction.ALLOW_ALERT_TOOL_ADMIN,
            StudioBudgetOverageAction.ALLOW_BILL_ORG,
            StudioBudgetOverageAction.ALLOW_WITH_WARNING,
        ):
            return
        raise ApiError(
            status_code=402,
            code="STUDIO_BUDGET_EXCEEDED",
            message=(
                "This studio has exceeded its monthly spend cap. "
                "Raise the cap or wait until next month."
            ),
        )

    async def assert_builder_budget(self, studio_id: UUID, user_id: UUID | None) -> None:
        """Block LLM calls when this member's MTD estimated spend exceeds their personal cap."""
        if user_id is None:
            return
        row = await self.db.get(StudioMember, (studio_id, user_id))
        if row is None or row.budget_cap_monthly_usd is None:
            return
        cap: Decimal = row.budget_cap_monthly_usd
        month_start = datetime.combine(
            date.today().replace(day=1),
            time.min,
            tzinfo=timezone.utc,
        )
        spent = await self.db.scalar(
            select(func.coalesce(func.sum(TokenUsage.estimated_cost_usd), 0)).where(
                TokenUsage.studio_id == studio_id,
                TokenUsage.user_id == user_id,
                TokenUsage.created_at >= month_start,
            )
        )
        spent_dec = Decimal(str(spent or 0))
        if spent_dec > cap:
            raise ApiError(
                status_code=402,
                code="BUILDER_BUDGET_EXCEEDED",
                message=(
                    "You have exceeded your monthly LLM spend cap for this studio. "
                    "Ask a studio or tool admin to raise your cap."
                ),
            )
