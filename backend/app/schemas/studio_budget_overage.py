"""Valid values for `studios.budget_overage_action` (Studio Owner budget settings + LLM policy)."""

from __future__ import annotations

from enum import StrEnum


class StudioBudgetOverageAction(StrEnum):
    """What happens when MTD spend passes the studio monthly cap (LLM path)."""

    PAUSE_GENERATIONS = "pause_generations"
    ALLOW_ALERT_STUDIO_ADMIN = "allow_alert_studio_admin"
    ALLOW_ALERT_TOOL_ADMIN = "allow_alert_tool_admin"
    ALLOW_BILL_ORG = "allow_bill_org"
    ALLOW_WITH_WARNING = "allow_with_warning"
    THROTTLE_REQUESTS = "throttle_requests"
    READ_ONLY_LLM = "read_only_llm"
