"""Token usage dashboard API schemas."""

from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class TokenUsageRowOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    studio_id: UUID | None
    software_id: UUID | None
    project_id: UUID | None
    work_order_id: UUID | None
    user_id: UUID | None
    call_type: str
    model: str
    input_tokens: int
    output_tokens: int
    estimated_cost_usd: Decimal | None
    created_at: datetime


class TokenUsageTotalsOut(BaseModel):
    input_tokens: int
    output_tokens: int
    estimated_cost_usd: Decimal = Field(
        default_factory=lambda: Decimal("0"),
    )


class BudgetMonthStatusOut(BaseModel):
    """Normalized MTD budget interpretation (single ladder for UI + API consumers)."""

    is_capped: bool
    usage_pct: float | None = None
    remaining_monthly_usd: Decimal | None = None
    severity: Literal["ok", "warn", "critical"]
    over_cap: bool = False
    blocks_new_usage: bool = False


class MeTokenUsageBuilderBudgetOut(BaseModel):
    """MTD estimated spend vs optional per-member cap (same basis as LLM enforcement)."""

    studio_id: UUID
    cap_monthly_usd: Decimal | None = None
    spent_monthly_usd: Decimal = Field(default_factory=lambda: Decimal("0"))
    budget_status: BudgetMonthStatusOut


class TokenUsageReportOut(BaseModel):
    rows: list[TokenUsageRowOut]
    totals: TokenUsageTotalsOut
    builder_budget: MeTokenUsageBuilderBudgetOut | None = None
