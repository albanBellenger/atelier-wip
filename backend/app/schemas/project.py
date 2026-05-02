"""Project API schemas."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None


class ProjectArchivePatch(BaseModel):
    archived: bool


class SectionSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    slug: str
    order: int
    status: Literal["ready", "gaps", "conflict", "empty"]
    updated_at: datetime


class ProjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    software_id: UUID
    name: str
    description: str | None
    archived: bool
    created_at: datetime
    updated_at: datetime
    sections: list[SectionSummary] | None = None
    work_orders_done: int = 0
    work_orders_total: int = 0
    sections_count: int = 0
    last_edited_at: datetime | None = None
