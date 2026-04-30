"""Private thread API schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ThreadMessageOut(BaseModel):
    id: UUID
    role: str
    content: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PrivateThreadDetail(BaseModel):
    thread_id: UUID
    messages: list[ThreadMessageOut]


class PrivateThreadStreamBody(BaseModel):
    content: str = Field(..., min_length=1)
