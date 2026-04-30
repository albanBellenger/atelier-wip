"""Token usage dashboard API schemas."""

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class TokenUsageRowOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    studio_id: UUID | None
    software_id: UUID | None
    project_id: UUID | None
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
    estimated_cost_usd: Decimal


class TokenUsageReportOut(BaseModel):
    rows: list[TokenUsageRowOut]
    totals: TokenUsageTotalsOut
