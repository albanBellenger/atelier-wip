"""Pydantic schemas for software codebase index API."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class CodebaseSnapshotResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    software_id: UUID
    commit_sha: str
    branch: str
    status: str
    error_message: str | None
    created_at: datetime
    ready_at: datetime | None
    file_count: int = 0
    chunk_count: int = 0


class CodebaseDiagnosticsResponse(BaseModel):
    repo_map: dict[str, Any]
    hits: list[dict[str, Any]]
