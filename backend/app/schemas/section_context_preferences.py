"""User preferences for RAG context assembly on a section."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class SectionContextPrefsOut(BaseModel):
    excluded_kinds: list[str] = Field(
        default_factory=list,
        description="Context block kinds to omit (e.g. git_history, retrieved_header)",
    )
    pinned_artifact_ids: list[UUID] = Field(default_factory=list)
    pinned_section_ids: list[UUID] = Field(default_factory=list)
    pinned_work_order_ids: list[UUID] = Field(default_factory=list)
    extra_urls: list[dict[str, Any]] = Field(
        default_factory=list,
        description='Each item may include "url" and optional "note"',
    )


class SectionContextPrefsPatch(BaseModel):
    excluded_kinds: list[str] | None = None
    pinned_artifact_ids: list[UUID] | None = None
    pinned_section_ids: list[UUID] | None = None
    pinned_work_order_ids: list[UUID] | None = None
    extra_urls: list[dict[str, Any]] | None = None
