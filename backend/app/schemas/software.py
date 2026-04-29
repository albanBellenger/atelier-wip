"""Software product schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class SoftwareCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None


class SoftwareUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    definition: str | None = None
    git_repo_url: str | None = None
    git_branch: str | None = None
    git_token: str | None = None


class SoftwareResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    studio_id: UUID
    name: str
    description: str | None
    definition: str | None
    git_provider: str | None
    git_repo_url: str | None
    git_branch: str | None
    git_token_set: bool
    created_at: datetime
    updated_at: datetime


class GitTestResult(BaseModel):
    ok: bool
    message: str
