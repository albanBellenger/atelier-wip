"""Aggregated section health for outline editor (drift, gaps, tokens, citations)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class SectionHealthOut(BaseModel):
    drift_count: int = Field(ge=0, description="Stale work orders linked to this section")
    gap_count: int = Field(ge=0, description="Open single-section issues (section gap)")
    token_used: int = Field(ge=0)
    token_budget: int = Field(ge=0)
    citations_resolved: int = Field(ge=0)
    citations_missing: int = Field(ge=0)
    drawer_drift: str | None = Field(
        default=None, description="Human-readable summary for Health drawer"
    )
    drawer_gap: str | None = None
    drawer_tokens: str | None = None
    drawer_sources: str | None = None
