"""Unit tests for LLM routing + studio policy resolution."""

import json
import uuid
from datetime import datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ApiError
from app.models import (
    AdminConfig,
    LlmProviderRegistry,
    LlmRoutingRule,
    Studio,
    StudioLlmProviderPolicy,
    TokenUsage,
)
from app.schemas.studio_budget_overage import StudioBudgetOverageAction
from app.services.llm_policy_service import LlmPolicyService
from tests.factories import add_studio_member, create_studio, create_user


@pytest.mark.asyncio
async def test_resolve_falls_back_when_registry_empty(db_session: AsyncSession) -> None:
    sid = uuid.uuid4()
    db_session.add(
        Studio(id=sid, name="S", budget_overage_action="pause_generations")
    )
    await db_session.flush()
    pol = LlmPolicyService(db_session)
    assert await pol.resolve_effective_model(studio_id=sid, call_type="chat") is None


@pytest.mark.asyncio
async def test_resolve_matches_routing_and_studio_policy(db_session: AsyncSession) -> None:
    sid = uuid.uuid4()
    db_session.add(
        Studio(id=sid, name="S", budget_overage_action="pause_generations")
    )
    cfg = await db_session.get(AdminConfig, 1)
    if cfg is None:
        cfg = AdminConfig(id=1, llm_model="gpt-4o-mini", llm_api_key="sk-test")
        db_session.add(cfg)
    else:
        cfg.llm_model = "gpt-4o-mini"
        cfg.llm_api_key = "sk-test"
    db_session.add(
        LlmProviderRegistry(
            id=uuid.uuid4(),
            provider_key="openai",
            display_name="OpenAI",
            models_json=json.dumps(["gpt-4o-mini", "gpt-4o"]),
            status="connected",
            is_default=True,
            sort_order=0,
        )
    )
    db_session.add(
        LlmRoutingRule(
            use_case="chat",
            primary_model="gpt-4o-mini",
            fallback_model=None,
        )
    )
    db_session.add(
        StudioLlmProviderPolicy(
            studio_id=sid,
            provider_key="openai",
            enabled=True,
            selected_model="gpt-4o-mini",
        )
    )
    await db_session.flush()
    pol = LlmPolicyService(db_session)
    m = await pol.resolve_effective_model(studio_id=sid, call_type="chat")
    assert m == "gpt-4o-mini"


@pytest.mark.asyncio
async def test_resolve_skips_disconnected_registry_provider(
    db_session: AsyncSession,
) -> None:
    sid = uuid.uuid4()
    db_session.add(
        Studio(id=sid, name="S", budget_overage_action="pause_generations")
    )
    cfg = await db_session.get(AdminConfig, 1)
    if cfg is None:
        cfg = AdminConfig(id=1, llm_model="gpt-4o-mini", llm_api_key="sk-test")
        db_session.add(cfg)
    else:
        cfg.llm_model = "gpt-4o-mini"
        cfg.llm_api_key = "sk-test"
    db_session.add(
        LlmProviderRegistry(
            id=uuid.uuid4(),
            provider_key="openai",
            display_name="OpenAI",
            models_json=json.dumps(["gpt-4o-mini", "gpt-4o"]),
            status="disconnected",
            is_default=True,
            sort_order=0,
        )
    )
    db_session.add(
        LlmRoutingRule(
            use_case="chat",
            primary_model="gpt-4o-mini",
            fallback_model=None,
        )
    )
    await db_session.flush()
    pol = LlmPolicyService(db_session)
    assert await pol.resolve_effective_model(studio_id=sid, call_type="chat") is None


@pytest.mark.asyncio
async def test_studio_chat_llm_models_lists_connected_policy_models_only(
    db_session: AsyncSession,
) -> None:
    sid = uuid.uuid4()
    db_session.add(
        Studio(id=sid, name="S", budget_overage_action="pause_generations")
    )
    cfg = await db_session.get(AdminConfig, 1)
    if cfg is None:
        cfg = AdminConfig(id=1, llm_model="gpt-4o-mini", llm_api_key="sk-test")
        db_session.add(cfg)
    else:
        cfg.llm_model = "gpt-4o-mini"
        cfg.llm_api_key = "sk-test"
    db_session.add(
        LlmProviderRegistry(
            id=uuid.uuid4(),
            provider_key="openai",
            display_name="OpenAI",
            models_json=json.dumps(["gpt-4o-mini", "gpt-4o"]),
            status="connected",
            is_default=True,
            sort_order=0,
        )
    )
    db_session.add(
        LlmRoutingRule(
            use_case="chat",
            primary_model="gpt-4o-mini",
            fallback_model="gpt-4o",
        )
    )
    db_session.add(
        StudioLlmProviderPolicy(
            studio_id=sid,
            provider_key="openai",
            enabled=True,
            selected_model="gpt-4o-mini",
        )
    )
    await db_session.flush()
    pol = LlmPolicyService(db_session)
    out = await pol.studio_chat_llm_models(sid)
    assert out.effective_model == "gpt-4o-mini"
    assert out.allowed_models == ["gpt-4o-mini"]
    assert out.workspace_default_model == "gpt-4o-mini"


@pytest.mark.asyncio
async def test_assert_builder_budget_noop_when_user_missing(db_session: AsyncSession) -> None:
    pol = LlmPolicyService(db_session)
    await pol.assert_builder_budget(uuid.uuid4(), None)


@pytest.mark.asyncio
async def test_assert_builder_budget_noop_without_cap(db_session: AsyncSession) -> None:
    studio = await create_studio(db_session)
    user = await create_user(db_session)
    await add_studio_member(db_session, studio.id, user.id, role="studio_member")
    pol = LlmPolicyService(db_session)
    await pol.assert_builder_budget(studio.id, user.id)


@pytest.mark.asyncio
async def test_assert_builder_budget_allows_when_under_cap(db_session: AsyncSession) -> None:
    studio = await create_studio(db_session)
    user = await create_user(db_session)
    mem = await add_studio_member(db_session, studio.id, user.id, role="studio_member")
    mem.budget_cap_monthly_usd = Decimal("100.00")
    db_session.add(
        TokenUsage(
            id=uuid.uuid4(),
            studio_id=studio.id,
            user_id=user.id,
            call_type="chat",
            model="m",
            input_tokens=1,
            output_tokens=1,
            estimated_cost_usd=Decimal("50.000000"),
            created_at=datetime.now(timezone.utc),
        )
    )
    await db_session.flush()
    pol = LlmPolicyService(db_session)
    await pol.assert_builder_budget(studio.id, user.id)


@pytest.mark.asyncio
async def test_assert_builder_budget_blocks_when_over_cap(db_session: AsyncSession) -> None:
    studio = await create_studio(db_session)
    user = await create_user(db_session)
    mem = await add_studio_member(db_session, studio.id, user.id, role="studio_member")
    mem.budget_cap_monthly_usd = Decimal("50.00")
    db_session.add(
        TokenUsage(
            id=uuid.uuid4(),
            studio_id=studio.id,
            user_id=user.id,
            call_type="chat",
            model="m",
            input_tokens=1,
            output_tokens=1,
            estimated_cost_usd=Decimal("50.000001"),
            created_at=datetime.now(timezone.utc),
        )
    )
    await db_session.flush()
    pol = LlmPolicyService(db_session)
    with pytest.raises(ApiError) as exc:
        await pol.assert_builder_budget(studio.id, user.id)
    assert exc.value.status_code == 402
    assert exc.value.error_code == "BUILDER_BUDGET_EXCEEDED"


@pytest.mark.asyncio
async def test_assert_builder_budget_no_membership_row_skipped(db_session: AsyncSession) -> None:
    studio = await create_studio(db_session)
    user = await create_user(db_session)
    pol = LlmPolicyService(db_session)
    await pol.assert_builder_budget(studio.id, user.id)


@pytest.mark.asyncio
async def test_assert_studio_budget_no_cap_skips(db_session: AsyncSession) -> None:
    studio = await create_studio(db_session)
    pol = LlmPolicyService(db_session)
    await pol.assert_studio_budget(studio.id)


@pytest.mark.asyncio
async def test_assert_studio_budget_soft_action_allows_over_cap(
    db_session: AsyncSession,
) -> None:
    studio = await create_studio(db_session)
    studio.budget_cap_monthly_usd = Decimal("10.00")
    studio.budget_overage_action = StudioBudgetOverageAction.ALLOW_WITH_WARNING.value
    db_session.add(
        TokenUsage(
            id=uuid.uuid4(),
            studio_id=studio.id,
            user_id=None,
            call_type="chat",
            model="m",
            input_tokens=1,
            output_tokens=1,
            estimated_cost_usd=Decimal("100.000000"),
            created_at=datetime.now(timezone.utc),
        )
    )
    await db_session.flush()
    pol = LlmPolicyService(db_session)
    await pol.assert_studio_budget(studio.id)


@pytest.mark.asyncio
async def test_assert_studio_budget_pause_blocks_over_cap(db_session: AsyncSession) -> None:
    studio = await create_studio(db_session)
    studio.budget_cap_monthly_usd = Decimal("10.00")
    studio.budget_overage_action = StudioBudgetOverageAction.PAUSE_GENERATIONS.value
    db_session.add(
        TokenUsage(
            id=uuid.uuid4(),
            studio_id=studio.id,
            user_id=None,
            call_type="chat",
            model="m",
            input_tokens=1,
            output_tokens=1,
            estimated_cost_usd=Decimal("100.000000"),
            created_at=datetime.now(timezone.utc),
        )
    )
    await db_session.flush()
    pol = LlmPolicyService(db_session)
    with pytest.raises(ApiError) as exc:
        await pol.assert_studio_budget(studio.id)
    assert exc.value.status_code == 402
    assert exc.value.error_code == "STUDIO_BUDGET_EXCEEDED"
