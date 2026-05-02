"""Artifact API schemas."""

from datetime import datetime
from typing import Literal
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


ArtifactScopeLevel = Literal["studio", "software", "project"]


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
    scope_level: ArtifactScopeLevel = "project"
    excluded_at_software: datetime | None = None
    excluded_at_project: datetime | None = None


class StudioArtifactRowOut(SoftwareArtifactRowOut):
    """Artifact on studio-wide aggregate list."""

    software_id: UUID
    software_name: str


class ArtifactExclusionPatch(BaseModel):
    artifact_id: UUID
    excluded: bool


class ArtifactExclusionPatchResult(BaseModel):
    artifact_id: UUID
    excluded: bool
