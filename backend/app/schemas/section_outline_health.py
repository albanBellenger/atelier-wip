"""Lightweight per-section health for list views (no per-section LLM citation calls)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class SectionOutlineHealthLite(BaseModel):
    """Batched drift/gap/token counts for outline rail tooltips (citation scan deferred)."""

    drift_count: int = Field(ge=0, description="Stale linked work orders for this section")
    gap_count: int = Field(
        ge=0,
        description="Open single-section issues (section_a, no section_b)",
    )
    token_used: int = Field(ge=0)
    token_budget: int = Field(ge=0)
    citation_scan_pending: bool = Field(
        default=True,
        description="True: citations not computed in this batch (open section /health for LLM scan).",
    )
