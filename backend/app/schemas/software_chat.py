"""Software-wide shared chat."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.messaging import SoftwareChatMessage


class SoftwareChatMessageOut(BaseModel):
    id: uuid.UUID
    software_id: uuid.UUID
    user_id: uuid.UUID | None
    role: str
    content: str
    created_at: datetime
    #: Poster display name when `user_id` is set and the user row is loaded.
    user_display_name: str | None = None

    model_config = {"from_attributes": True}

    @classmethod
    def from_message(cls, m: SoftwareChatMessage) -> SoftwareChatMessageOut:
        display: str | None = None
        if m.user_id is not None:
            u = m.user
            if u is not None:
                display = u.display_name
        return cls(
            id=m.id,
            software_id=m.software_id,
            user_id=m.user_id,
            role=m.role,
            content=m.content,
            created_at=m.created_at,
            user_display_name=display,
        )


class SoftwareChatHistoryResponse(BaseModel):
    messages: list[SoftwareChatMessageOut]
    next_before: uuid.UUID | None = Field(
        None,
        description="Pass as `before` to fetch older messages when paginating.",
    )
