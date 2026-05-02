"""Software dashboard activity feed."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class SoftwareActivityItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    verb: str
    summary: str
    actor_user_id: UUID | None
    entity_type: str | None
    entity_id: UUID | None
    created_at: datetime
    actor_display: str | None = None
    context_label: str | None = None


class SoftwareActivityListOut(BaseModel):
    items: list[SoftwareActivityItemOut]
