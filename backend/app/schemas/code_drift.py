"""API + service payloads for codebase drift analysis (Slice 16e)."""

from pydantic import BaseModel, Field


class CodeDriftRunResult(BaseModel):
    skipped_reason: str | None = None
    sections_evaluated: int = Field(ge=0, default=0)
    sections_flagged: int = Field(ge=0, default=0)
    work_orders_evaluated: int = Field(ge=0, default=0)
    work_orders_flagged: int = Field(ge=0, default=0)
