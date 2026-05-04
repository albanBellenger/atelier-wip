"""Software-wide shared chat."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class SoftwareChatMessageOut(BaseModel):
    id: uuid.UUID
    software_id: uuid.UUID
    user_id: uuid.UUID | None
    role: str
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


class SoftwareChatHistoryResponse(BaseModel):
    messages: list[SoftwareChatMessageOut]
    next_before: uuid.UUID | None = Field(
        None,
        description="Pass as `before` to fetch older messages when paginating.",
    )
