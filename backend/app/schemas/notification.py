"""API schemas for user notifications."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    kind: str
    title: str
    body: str
    read_at: datetime | None
    created_at: datetime
    studio_id: UUID | None = None
    software_id: UUID | None = None
    project_id: UUID | None = None
    section_id: UUID | None = None


class NotificationListOut(BaseModel):
    items: list[NotificationOut]
    next_cursor: str | None = None


class NotificationReadPatch(BaseModel):
    read: bool = Field(description="True to mark read, false to mark unread.")


class MarkAllReadOut(BaseModel):
    updated: int
