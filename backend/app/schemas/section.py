"""Section API schemas."""

from datetime import datetime
from typing import Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.section_outline_health import SectionOutlineHealthLite


class SectionCreate(BaseModel):
    title: str = Field(min_length=1, max_length=512)
    slug: str | None = Field(default=None, max_length=256)
    content: str | None = Field(
        default=None,
        max_length=500_000,
        description="Optional initial Markdown (e.g. backprop outline summary).",
    )


class SectionUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=512)
    slug: str | None = Field(default=None, max_length=256)
    order: int | None = None
    content: str | None = None


class SectionReorder(BaseModel):
    section_ids: list[UUID]


class SectionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID | None = None
    software_id: UUID | None = None
    title: str
    slug: str
    order: int
    content: str
    status: Literal["ready", "gaps", "conflict", "empty"]
    open_issue_count: int = Field(
        default=0,
        ge=0,
        description="Open issues referencing this section (section_a or section_b)",
    )
    outline_health: SectionOutlineHealthLite | None = Field(
        default=None,
        description="Present when list_sections include_outline_health=true (no LLM citation batch).",
    )
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="after")
    def exactly_one_owner_scope(self) -> Self:
        has_p = self.project_id is not None
        has_s = self.software_id is not None
        if has_p == has_s:
            raise ValueError(
                "SectionResponse requires exactly one of project_id or software_id"
            )
        return self
