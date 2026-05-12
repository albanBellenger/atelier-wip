"""Request/response schemas for Software Docs backprop (codebase-assisted drafting)."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class BackpropOutlineRequest(BaseModel):
    """POST /software/{sid}/docs/propose-outline body."""

    hint: str | None = Field(default=None, max_length=4000)


class BackpropOutlineSectionItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str = Field(..., min_length=1, max_length=512)
    slug: str = Field(..., min_length=1, max_length=256)
    summary: str = Field(default="", max_length=2000)


class BackpropOutlineProposalResponse(BaseModel):
    sections: list[BackpropOutlineSectionItem]


class BackpropSectionProposalResponse(BaseModel):
    markdown: str = Field(default="", max_length=500_000)
    source_files: list[str] = Field(default_factory=list)
