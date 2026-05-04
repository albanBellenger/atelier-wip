"""Project API schemas."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    publish_folder_slug: str | None = Field(default=None, max_length=128)


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    publish_folder_slug: str | None = Field(default=None, max_length=128)


class ProjectArchivePatch(BaseModel):
    archived: bool


class SectionSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    slug: str
    order: int
    status: Literal["ready", "gaps", "conflict", "empty"]
    open_issue_count: int = Field(default=0, ge=0)
    updated_at: datetime


class ProjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    software_id: UUID
    name: str
    description: str | None
    publish_folder_slug: str
    archived: bool
    created_at: datetime
    updated_at: datetime
    sections: list[SectionSummary] | None = None
    work_orders_done: int = 0
    work_orders_total: int = 0
    sections_count: int = 0
    last_edited_at: datetime | None = None


class StudioProjectListItemOut(ProjectResponse):
    """Project row on studio-wide listing (includes parent software name)."""

    software_name: str
