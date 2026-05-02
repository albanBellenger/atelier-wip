"""Artifact API schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ArtifactResponse(BaseModel):
    id: UUID
    project_id: UUID
    name: str
    file_type: str
    size_bytes: int
    uploaded_by: UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}


class MarkdownArtifactCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=512)
    content: str = Field(default="")


class SoftwareArtifactRowOut(BaseModel):
    """Artifact row for software-wide list (includes owning project)."""

    id: UUID
    project_id: UUID
    project_name: str
    name: str
    file_type: str
    size_bytes: int
    uploaded_by: UUID | None
    uploaded_by_display: str | None
    created_at: datetime
