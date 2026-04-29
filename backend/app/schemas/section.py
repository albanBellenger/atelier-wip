"""Section API schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class SectionCreate(BaseModel):
    title: str = Field(min_length=1, max_length=512)
    slug: str | None = Field(default=None, max_length=256)


class SectionUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=512)
    slug: str | None = Field(default=None, max_length=256)
    order: int | None = None
    content: str | None = None


class SectionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    title: str
    slug: str
    order: int
    content: str
    created_at: datetime
    updated_at: datetime
