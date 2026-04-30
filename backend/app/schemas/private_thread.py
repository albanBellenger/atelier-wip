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


# Align with collab / LLM payload limits (chars ≈ budget * 4 scale).
PRIVATE_THREAD_SECTION_PLAINTEXT_MAX = 500_000


class PrivateThreadStreamBody(BaseModel):
    content: str = Field(..., min_length=1)
    current_section_plaintext: str | None = Field(
        default=None,
        max_length=PRIVATE_THREAD_SECTION_PLAINTEXT_MAX,
        description="Optional live editor markdown; overrides DB section content for RAG.",
    )
    include_git_history: bool = Field(
        default=False,
        description="When true, append recent GitLab commits to RAG context if configured.",
    )
