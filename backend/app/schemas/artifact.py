"""Artifact API schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ArtifactResponse(BaseModel):
    id: UUID
    project_id: UUID
    name: str
    file_type: str
    uploaded_by: UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}


class MarkdownArtifactCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=512)
    content: str = Field(default="")
