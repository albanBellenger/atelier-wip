"""Aggregated project attention items for builder home."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


AttentionKind = Literal["conflict", "gap", "drift", "update"]


class AttentionLinksOut(BaseModel):
    issue_id: UUID | None = None
    work_order_id: UUID | None = None
    section_id: UUID | None = None


class AttentionItemOut(BaseModel):
    id: str = Field(description="Stable id for React keys: issue:{uuid} or wo:{uuid}")
    kind: AttentionKind
    title: str
    subtitle: str
    description: str
    occurred_at: datetime
    links: AttentionLinksOut


class AttentionCountsOut(BaseModel):
    all: int
    conflict: int
    drift: int
    gap: int
    update: int


class AttentionListOut(BaseModel):
    studio_id: UUID
    software_id: UUID
    project_id: UUID
    counts: AttentionCountsOut
    items: list[AttentionItemOut]


class SoftwareAttentionItemOut(BaseModel):
    project_id: UUID
    project_name: str
    item: AttentionItemOut


class SoftwareAttentionListOut(BaseModel):
    studio_id: UUID
    software_id: UUID
    counts: AttentionCountsOut
    items: list[SoftwareAttentionItemOut]
