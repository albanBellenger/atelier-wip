"""Artifact API schemas."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

ArtifactScopeLevel = Literal["studio", "software", "project"]
EmbeddingStatusLiteral = Literal["pending", "embedded", "failed", "skipped"]


class ChunkPreview(BaseModel):
    chunk_index: int
    content: str
    content_length: int


class ArtifactDetailResponse(BaseModel):
    id: UUID
    project_id: UUID | None = None
    scope_level: ArtifactScopeLevel = "project"
    """Owning studio for this row (for scope changes and navigation)."""
    context_studio_id: UUID
    """Parent software when scope is software or project; null for studio-wide rows."""
    context_software_id: UUID | None = None
    name: str
    file_type: str
    size_bytes: int
    uploaded_by: UUID | None
    created_at: datetime
    chunking_strategy: str | None = None
    embedding_status: EmbeddingStatusLiteral | None = None
    embedded_at: datetime | None = None
    chunk_count: int | None = None
    extracted_char_count: int | None = None
    embedding_error: str | None = None
    chunk_previews: list[ChunkPreview] = Field(default_factory=list)


class ArtifactResponse(BaseModel):
    id: UUID
    project_id: UUID | None
    scope_level: ArtifactScopeLevel = "project"
    name: str
    file_type: str
    size_bytes: int
    uploaded_by: UUID | None
    created_at: datetime
    chunking_strategy: str | None = None
    embedding_status: EmbeddingStatusLiteral | None = None
    embedded_at: datetime | None = None
    chunk_count: int | None = None
    extracted_char_count: int | None = None

    model_config = {"from_attributes": True}


class MarkdownArtifactCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=512)
    content: str = Field(default="")


class SoftwareArtifactRowOut(BaseModel):
    """Artifact row for software-wide list (includes owning project when project-scoped)."""

    id: UUID
    project_id: UUID | None = None
    project_name: str | None = None
    name: str
    file_type: str
    size_bytes: int
    uploaded_by: UUID | None
    uploaded_by_display: str | None
    created_at: datetime
    scope_level: ArtifactScopeLevel = "project"
    chunking_strategy: str | None = None
    excluded_at_software: datetime | None = None
    excluded_at_project: datetime | None = None
    embedding_status: EmbeddingStatusLiteral | None = None
    embedded_at: datetime | None = None
    chunk_count: int | None = None
    extracted_char_count: int | None = None


class StudioArtifactRowOut(SoftwareArtifactRowOut):
    """Artifact on studio-wide aggregate list."""

    software_id: UUID | None = None
    software_name: str | None = None


class ArtifactExclusionPatch(BaseModel):
    artifact_id: UUID
    excluded: bool


class ChunkingStrategiesResponse(BaseModel):
    strategies: list[str]


class ArtifactChunkingStrategyPatch(BaseModel):
    chunking_strategy: str | None = Field(None, max_length=32)


class ArtifactScopePatch(BaseModel):
    """Move an artifact between studio, software, and project library scopes (same studio only)."""

    scope_level: Literal["studio", "software", "project"]
    software_id: UUID | None = None
    project_id: UUID | None = None


class ArtifactExclusionPatchResult(BaseModel):
    artifact_id: UUID
    excluded: bool
