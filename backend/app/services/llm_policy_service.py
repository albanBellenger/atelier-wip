"""Resolve effective LLM model from routing + per-studio policy + provider registry."""

from __future__ import annotations

from datetime import date, datetime, time, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ApiError
from app.models import (
    LlmProviderRegistry,
    LlmRoutingRule,
    Studio,
    StudioLlmProviderPolicy,
    StudioMember,
    TokenUsage,
)
from app.schemas.studio_budget_overage import StudioBudgetOverageAction
from app.schemas.studio_llm_public import StudioChatLlmModelsOut
from app.services.llm_registry_credentials import (
    first_registry_model,
    get_default_llm_registry_row,
)
from app.services.registry_models_json import model_ids_from_json, parse_models_json
from app.services.budget_month_status import studio_overage_soft_allow


def use_case_for_call_source(call_source: str) -> str:
    """Map token_usage.call_source to a routing use_case key."""
    ct = (call_source or "chat").lower()
    if ct in ("work_order_gen", "work_order_dedupe", "work_order", "mcp", "mcp_wo"):
        return "code_gen"
    if ct in ("drift", "section_drift"):
        return "classification"
    if "embed" in ct:
        return "embeddings"
    return "chat"


def _registry_connected(pr: LlmProviderRegistry) -> bool:
    return (pr.status or "").strip().lower() == "connected"


def _models_from_registry_row(pr: LlmProviderRegistry) -> list[str]:
    return model_ids_from_json(pr.models_json)


def _max_context_tokens_for_model_id(
    providers_all: list[LlmProviderRegistry],
    model_id: str,
) -> int | None:
    want = (model_id or "").strip()
    if not want:
        return None
    for pr in providers_all:
        if not _registry_connected(pr):
            continue
        for entry in parse_models_json(pr.models_json):
            if entry.id == want:
                return entry.max_context_tokens
    return None


class LlmPolicyService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def resolve_effective_llm_route(
        self,
        *,
        studio_id: UUID,
        call_source: str,
    ) -> tuple[str | None, str | None]:
        """Return (effective_model_override, provider_key) or (None, None) for registry defaults."""
        use_case = use_case_for_call_source(call_source)
        reg_count = await self.db.scalar(
            select(func.count()).select_from(LlmProviderRegistry)
        )
        if not reg_count:
            return None, None

        routing = await self.db.get(LlmRoutingRule, use_case)
        if routing is None:
            routing = await self.db.get(LlmRoutingRule, "chat")
        if routing is None:
            return None, None

        candidates: list[str] = []
        if routing.primary_model.strip():
            candidates.append(routing.primary_model.strip())
        if routing.fallback_model and routing.fallback_model.strip():
            candidates.append(routing.fallback_model.strip())

        providers = list(
            (
                await self.db.execute(
                    select(LlmProviderRegistry).order_by(
                        LlmProviderRegistry.sort_order,
                        LlmProviderRegistry.provider_key,
                    )
                )
            )
            .scalars()
            .all()
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
                if not _registry_connected(pr):
                    continue
                if model_name in _models_from_registry_row(pr):
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
            return cand, pk
        return None, None

    async def resolve_effective_model(
        self,
        *,
        studio_id: UUID,
        call_source: str,
    ) -> str | None:
        """Return override model id or None to use default registry model."""
        m, _pk = await self.resolve_effective_llm_route(
            studio_id=studio_id,
            call_source=call_source,
        )
        return m

    async def studio_chat_llm_models(self, studio_id: UUID) -> StudioChatLlmModelsOut:
        """Models allowed for chat in this studio (connected registry + policy / routing)."""
        effective = await self.resolve_effective_model(
            studio_id=studio_id,
            call_source="chat",
        )
        default_row = await get_default_llm_registry_row(self.db)
        workspace_default = first_registry_model(default_row)

        providers_all = list(
            (
                await self.db.execute(
                    select(LlmProviderRegistry).order_by(
                        LlmProviderRegistry.sort_order,
                        LlmProviderRegistry.provider_key,
                    )
                )
            )
            .scalars()
            .all()
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
        has_any_policy = len(policy_rows) > 0

        allowed: list[str] = []
        seen: set[str] = set()

        def add_allowed(m: str | None) -> None:
            if not m:
                return
            t = m.strip()
            if not t or t in seen:
                return
            seen.add(t)
            allowed.append(t)

        if has_any_policy:
            prov_by_key = {p.provider_key: p for p in providers_all}
            for pol in policy_rows:
                if not pol.enabled:
                    continue
                sm = (pol.selected_model or "").strip()
                if not sm:
                    continue
                pr = prov_by_key.get(pol.provider_key)
                if pr is None or not _registry_connected(pr):
                    continue
                if sm in _models_from_registry_row(pr):
                    add_allowed(sm)
        else:
            routing = await self.db.get(LlmRoutingRule, "chat")
            if routing is not None:
                candidates: list[str] = []
                if routing.primary_model.strip():
                    candidates.append(routing.primary_model.strip())
                if routing.fallback_model and routing.fallback_model.strip():
                    candidates.append(routing.fallback_model.strip())
                connected = [p for p in providers_all if _registry_connected(p)]
                for cand in candidates:
                    for pr in connected:
                        if cand in _models_from_registry_row(pr):
                            add_allowed(cand)
                            break

        ref_list: list[str] = []

        def add_ref(mid: str | None) -> None:
            t = (mid or "").strip()
            if not t or t in ref_list:
                return
            ref_list.append(t)

        add_ref(effective)
        add_ref(workspace_default)
        for m in allowed:
            add_ref(m)
        ctx_map = {
            mid: _max_context_tokens_for_model_id(providers_all, mid) for mid in ref_list
        }

        return StudioChatLlmModelsOut(
            effective_model=effective,
            workspace_default_model=workspace_default,
            allowed_models=allowed,
            model_max_context_tokens=ctx_map,
        )

    async def resolve_preferred_chat_model(
        self,
        *,
        studio_id: UUID,
        preferred_model: str | None,
    ) -> str | None:
        """Return trimmed model id if allowed for studio chat, else raise ApiError 400.

        Allowed set is ``allowed_models`` from :meth:`studio_chat_llm_models`, plus
        ``effective_model`` and ``workspace_default_model`` when non-empty (so defaults
        remain valid when the explicit allow-list is empty).
        """
        if preferred_model is None or str(preferred_model).strip() == "":
            return None
        pref = str(preferred_model).strip()
        out = await self.studio_chat_llm_models(studio_id)
        choices: set[str] = set()
        for m in out.allowed_models:
            t = m.strip()
            if t:
                choices.add(t)
        for m in (out.effective_model, out.workspace_default_model):
            if m and str(m).strip():
                choices.add(str(m).strip())
        if pref not in choices:
            raise ApiError(
                status_code=400,
                code="CHAT_MODEL_NOT_ALLOWED",
                message="Requested model is not allowed for chat in this studio.",
            )
        return pref

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
        if studio_overage_soft_allow(st.budget_overage_action):
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
                    "Ask a Studio Owner to raise your cap."
                ),
            )
