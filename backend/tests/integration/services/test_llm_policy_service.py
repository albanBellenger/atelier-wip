"""Unit tests for LLM routing + studio policy resolution."""

import json
import uuid
from datetime import datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ApiError
from app.models import (
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
    assert await pol.resolve_effective_model(studio_id=sid, call_source="chat") is None


@pytest.mark.asyncio
async def test_resolve_matches_routing_and_studio_policy(db_session: AsyncSession) -> None:
    sid = uuid.uuid4()
    db_session.add(
        Studio(id=sid, name="S", budget_overage_action="pause_generations")
    )
    await db_session.flush()
    db_session.add(
        LlmProviderRegistry(
            id=uuid.uuid4(),
            provider_id="openai",
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
            provider_id="openai",
            enabled=True,
            selected_model="gpt-4o-mini",
        )
    )
    await db_session.flush()
    pol = LlmPolicyService(db_session)
    m = await pol.resolve_effective_model(studio_id=sid, call_source="chat")
    assert m == "gpt-4o-mini"


@pytest.mark.asyncio
async def test_resolve_skips_disconnected_registry_provider(
    db_session: AsyncSession,
) -> None:
    sid = uuid.uuid4()
    db_session.add(
        Studio(id=sid, name="S", budget_overage_action="pause_generations")
    )
    db_session.add(
        LlmProviderRegistry(
            id=uuid.uuid4(),
            provider_id="openai",
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
    assert await pol.resolve_effective_model(studio_id=sid, call_source="chat") is None


@pytest.mark.asyncio
async def test_studio_chat_llm_models_lists_connected_policy_models_only(
    db_session: AsyncSession,
) -> None:
    sid = uuid.uuid4()
    db_session.add(
        Studio(id=sid, name="S", budget_overage_action="pause_generations")
    )
    await db_session.flush()
    db_session.add(
        LlmProviderRegistry(
            id=uuid.uuid4(),
            provider_id="openai",
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
            provider_id="openai",
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
    assert out.model_max_context_tokens.get("gpt-4o-mini") is None


@pytest.mark.asyncio
async def test_studio_chat_llm_models_includes_context_from_registry_entries(
    db_session: AsyncSession,
) -> None:
    from app.schemas.llm_registry_model import LlmRegistryModelEntry
    from app.services.registry_models_json import serialize_models_json

    sid = uuid.uuid4()
    db_session.add(
        Studio(id=sid, name="S", budget_overage_action="pause_generations")
    )
    await db_session.flush()
    payload = serialize_models_json(
        [
            LlmRegistryModelEntry(
                id="gpt-4o-mini",
                max_context_tokens=128_000,
                context_metadata_source="litellm",
            )
        ]
    )
    db_session.add(
        LlmProviderRegistry(
            id=uuid.uuid4(),
            provider_id="openai",
            models_json=payload,
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
            provider_id="openai",
            enabled=True,
            selected_model="gpt-4o-mini",
        )
    )
    await db_session.flush()
    pol = LlmPolicyService(db_session)
    out = await pol.studio_chat_llm_models(sid)
    assert out.model_max_context_tokens.get("gpt-4o-mini") == 128_000


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
            call_source="chat",
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
            call_source="chat",
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
            call_source="chat",
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
            call_source="chat",
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


@pytest.mark.asyncio
async def test_resolve_embedding_route_platform_skips_studio_policies(
    db_session: AsyncSession,
) -> None:
    sid = uuid.uuid4()
    db_session.add(
        Studio(id=sid, name="S", budget_overage_action="pause_generations")
    )
    await db_session.flush()
    db_session.add(
        LlmProviderRegistry(
            id=uuid.uuid4(),
            provider_id="openai",
            models_json=json.dumps(
                [{"id": "text-embedding-3-small", "kind": "embedding"}]
            ),
            status="connected",
            is_default=True,
            sort_order=0,
        )
    )
    db_session.add(
        LlmRoutingRule(
            use_case="embeddings",
            primary_model="text-embedding-3-small",
            fallback_model=None,
        )
    )
    db_session.add(
        StudioLlmProviderPolicy(
            studio_id=sid,
            provider_id="openai",
            enabled=True,
            selected_model="gpt-4o-mini",
        )
    )
    await db_session.flush()
    pol = LlmPolicyService(db_session)
    m, pk = await pol.resolve_embedding_route(studio_id=None)
    assert m == "text-embedding-3-small"
    assert pk == "openai"


@pytest.mark.asyncio
async def test_resolve_embedding_route_studio_ignores_chat_selected_model(
    db_session: AsyncSession,
) -> None:
    sid = uuid.uuid4()
    db_session.add(
        Studio(id=sid, name="S", budget_overage_action="pause_generations")
    )
    await db_session.flush()
    db_session.add(
        LlmProviderRegistry(
            id=uuid.uuid4(),
            provider_id="openai",
            models_json=json.dumps(
                [
                    {"id": "gpt-4o-mini", "kind": "chat"},
                    {"id": "text-embedding-3-small", "kind": "embedding"},
                ]
            ),
            status="connected",
            is_default=True,
            sort_order=0,
        )
    )
    db_session.add(
        LlmRoutingRule(
            use_case="embeddings",
            primary_model="text-embedding-3-small",
            fallback_model=None,
        )
    )
    db_session.add(
        StudioLlmProviderPolicy(
            studio_id=sid,
            provider_id="openai",
            enabled=True,
            selected_model="gpt-4o-mini",
        )
    )
    await db_session.flush()
    pol = LlmPolicyService(db_session)
    m, pk = await pol.resolve_embedding_route(studio_id=sid)
    assert m == "text-embedding-3-small"
    assert pk == "openai"


@pytest.mark.asyncio
async def test_resolve_preferred_chat_model_accepts_allowed_and_rejects_other(
    db_session: AsyncSession,
) -> None:
    sid = uuid.uuid4()
    db_session.add(
        Studio(id=sid, name="S", budget_overage_action="pause_generations")
    )
    await db_session.flush()
    db_session.add(
        LlmProviderRegistry(
            id=uuid.uuid4(),
            provider_id="openai",
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
            provider_id="openai",
            enabled=True,
            selected_model="gpt-4o-mini",
        )
    )
    await db_session.flush()
    pol = LlmPolicyService(db_session)
    assert (
        await pol.resolve_preferred_chat_model(
            studio_id=sid,
            preferred_model="gpt-4o-mini",
        )
        == "gpt-4o-mini"
    )
    assert await pol.resolve_preferred_chat_model(studio_id=sid, preferred_model=None) is None
    assert await pol.resolve_preferred_chat_model(studio_id=sid, preferred_model="  ") is None
    with pytest.raises(ApiError) as exc:
        await pol.resolve_preferred_chat_model(studio_id=sid, preferred_model="gpt-4o")
    assert exc.value.error_code == "CHAT_MODEL_NOT_ALLOWED"
