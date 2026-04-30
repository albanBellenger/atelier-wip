"""Project-wide chat (Slice 10)."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class ChatMessageOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    user_id: uuid.UUID | None
    role: str
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatHistoryResponse(BaseModel):
    messages: list[ChatMessageOut]
    next_before: uuid.UUID | None = Field(
        None,
        description="Pass as `before` to fetch older messages when paginating.",
    )


class ProjectChatWsClientMessage(BaseModel):
    type: str = Field(..., description="Expected: user_message")
    content: str = Field(..., min_length=1, max_length=32000)
