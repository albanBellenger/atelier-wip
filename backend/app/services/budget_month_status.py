"""Normalized monthly USD budget status for API responses (single ladder vs UI duplication).

Display semantics:
    ``is_capped`` is true only when ``cap`` is set and **greater than zero**. Caps of ``0``
    or unset caps are treated as uncapped for percentages and severity bands.

Enforcement (see ``LLMPolicyService``) is unchanged: a stored ``Decimal(\"0\")`` cap still
blocks spend above zero for builders/studios that persist it; prefer PATCH payloads that
send ``null`` instead of zero when clearing a cap.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Literal

from app.schemas.studio_budget_overage import StudioBudgetOverageAction

BudgetSeverity = Literal["ok", "warn", "critical"]

# Single ladder for admin UI + builder strip (aligned with BudgetsSection alert copy).
_WARN_USAGE_RATIO = Decimal("0.75")
_CRITICAL_USAGE_RATIO = Decimal("0.90")


def _severity_from_ratio(ratio: Decimal) -> BudgetSeverity:
    if ratio >= _CRITICAL_USAGE_RATIO:
        return "critical"
    if ratio >= _WARN_USAGE_RATIO:
        return "warn"
    return "ok"


def _decimal_pct(spent: Decimal, cap: Decimal) -> float:
    if cap <= 0:
        return 0.0
    raw = (spent / cap) * Decimal("100")
    bounded = min(Decimal("100"), max(Decimal("0"), raw))
    return float(bounded.quantize(Decimal("0.01")))


def studio_overage_soft_allow(action_raw: str | None) -> bool:
    """True when MTD over cap still allows LLM calls (matches ``assert_studio_budget``)."""
    raw = (action_raw or "").strip() or StudioBudgetOverageAction.PAUSE_GENERATIONS.value
    try:
        action = StudioBudgetOverageAction(raw)
    except ValueError:
        action = StudioBudgetOverageAction.PAUSE_GENERATIONS
    return action in (
        StudioBudgetOverageAction.ALLOW_ALERT_STUDIO_ADMIN,
        StudioBudgetOverageAction.ALLOW_ALERT_TOOL_ADMIN,
        StudioBudgetOverageAction.ALLOW_BILL_ORG,
        StudioBudgetOverageAction.ALLOW_WITH_WARNING,
    )


def compute_builder_budget_status(
    spent_monthly_usd: Decimal,
    cap_monthly_usd: Decimal | None,
) -> dict[str, object]:
    """MTD builder cap status (per-member)."""
    spent = spent_monthly_usd
    cap = cap_monthly_usd
    display_capped = cap is not None and cap > 0

    over_cap = cap is not None and spent > cap
    blocks_new_usage = over_cap

    if not display_capped:
        return {
            "is_capped": False,
            "usage_pct": None,
            "remaining_monthly_usd": None,
            "severity": "ok",
            "over_cap": bool(over_cap),
            "blocks_new_usage": bool(blocks_new_usage),
        }

    remaining = cap - spent
    ratio = spent / cap if cap > 0 else Decimal("0")
    return {
        "is_capped": True,
        "usage_pct": _decimal_pct(spent, cap),
        "remaining_monthly_usd": remaining,
        "severity": _severity_from_ratio(ratio),
        "over_cap": bool(over_cap),
        "blocks_new_usage": bool(blocks_new_usage),
    }


def compute_studio_budget_status(
    mtd_spend_usd: Decimal,
    budget_cap_monthly_usd: Decimal | None,
    budget_overage_action: str | None,
) -> dict[str, object]:
    """MTD studio cap status (tool-admin overview)."""
    spent = mtd_spend_usd
    cap = budget_cap_monthly_usd
    display_capped = cap is not None and cap > 0

    over_cap = cap is not None and spent > cap
    if cap is None or spent <= cap:
        blocks_new_usage = False
    else:
        blocks_new_usage = not studio_overage_soft_allow(budget_overage_action)

    if not display_capped:
        return {
            "is_capped": False,
            "usage_pct": None,
            "remaining_monthly_usd": None,
            "severity": "ok",
            "over_cap": bool(over_cap),
            "blocks_new_usage": bool(blocks_new_usage),
        }

    assert cap is not None and cap > 0
    remaining = cap - spent
    ratio = spent / cap
    return {
        "is_capped": True,
        "usage_pct": _decimal_pct(spent, cap),
        "remaining_monthly_usd": remaining,
        "severity": _severity_from_ratio(ratio),
        "over_cap": bool(over_cap),
        "blocks_new_usage": bool(blocks_new_usage),
    }
