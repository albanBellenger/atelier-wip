"""Unit tests for normalized monthly budget status helpers."""

from decimal import Decimal

import pytest

from app.schemas.studio_budget_overage import StudioBudgetOverageAction
from app.services.budget_month_status import (
    compute_builder_budget_status,
    compute_studio_budget_status,
    studio_overage_soft_allow,
)


def test_builder_uncapped_when_cap_none() -> None:
    out = compute_builder_budget_status(Decimal("10"), None)
    assert out["is_capped"] is False
    assert out["usage_pct"] is None
    assert out["remaining_monthly_usd"] is None
    assert out["severity"] == "ok"
    assert out["over_cap"] is False
    assert out["blocks_new_usage"] is False


def test_builder_uncapped_display_when_cap_zero_but_enforcement_over() -> None:
    """Display treats 0 cap as uncapped; enforcement still blocks any spend > 0."""
    out = compute_builder_budget_status(Decimal("5"), Decimal("0"))
    assert out["is_capped"] is False
    assert out["usage_pct"] is None
    assert out["over_cap"] is True
    assert out["blocks_new_usage"] is True


@pytest.mark.parametrize(
    ("spent", "cap", "want_sev"),
    [
        (Decimal("50"), Decimal("100"), "ok"),
        (Decimal("74"), Decimal("100"), "ok"),
        (Decimal("75"), Decimal("100"), "warn"),
        (Decimal("89.99"), Decimal("100"), "warn"),
        (Decimal("90"), Decimal("100"), "critical"),
        (Decimal("100"), Decimal("100"), "critical"),
    ],
)
def test_builder_severity_ladder(
    spent: Decimal, cap: Decimal, want_sev: str
) -> None:
    out = compute_builder_budget_status(spent, cap)
    assert out["is_capped"] is True
    assert out["severity"] == want_sev


def test_builder_remaining_and_pct() -> None:
    out = compute_builder_budget_status(Decimal("25.50"), Decimal("100"))
    assert out["remaining_monthly_usd"] == Decimal("74.50")
    assert out["usage_pct"] == 25.50


def test_builder_over_cap_blocks() -> None:
    out = compute_builder_budget_status(Decimal("50.01"), Decimal("50"))
    assert out["over_cap"] is True
    assert out["blocks_new_usage"] is True


def test_studio_soft_allow_no_block() -> None:
    out = compute_studio_budget_status(
        Decimal("100"),
        Decimal("50"),
        StudioBudgetOverageAction.ALLOW_WITH_WARNING.value,
    )
    assert out["over_cap"] is True
    assert out["blocks_new_usage"] is False


def test_studio_hard_stop_blocks() -> None:
    out = compute_studio_budget_status(
        Decimal("100"),
        Decimal("50"),
        StudioBudgetOverageAction.PAUSE_GENERATIONS.value,
    )
    assert out["over_cap"] is True
    assert out["blocks_new_usage"] is True


def test_studio_invalid_action_defaults_pause_blocks() -> None:
    out = compute_studio_budget_status(Decimal("100"), Decimal("50"), "not_a_real_action")
    assert out["blocks_new_usage"] is True


def test_studio_under_cap_no_block() -> None:
    out = compute_studio_budget_status(
        Decimal("40"),
        Decimal("100"),
        StudioBudgetOverageAction.PAUSE_GENERATIONS.value,
    )
    assert out["over_cap"] is False
    assert out["blocks_new_usage"] is False


def test_studio_soft_allow_list_matches_policy() -> None:
    assert studio_overage_soft_allow(
        StudioBudgetOverageAction.ALLOW_ALERT_STUDIO_ADMIN.value
    )
    assert studio_overage_soft_allow(
        StudioBudgetOverageAction.ALLOW_ALERT_TOOL_ADMIN.value
    )
    assert studio_overage_soft_allow(StudioBudgetOverageAction.ALLOW_BILL_ORG.value)
    assert studio_overage_soft_allow(
        StudioBudgetOverageAction.ALLOW_WITH_WARNING.value
    )
    assert not studio_overage_soft_allow(
        StudioBudgetOverageAction.THROTTLE_REQUESTS.value
    )
    assert not studio_overage_soft_allow(StudioBudgetOverageAction.READ_ONLY_LLM.value)


def test_studio_uncapped_display_cap_zero() -> None:
    out = compute_studio_budget_status(
        Decimal("10"), Decimal("0"), StudioBudgetOverageAction.PAUSE_GENERATIONS.value
    )
    assert out["is_capped"] is False
    assert out["over_cap"] is True
