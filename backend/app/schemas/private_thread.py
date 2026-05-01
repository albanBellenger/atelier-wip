"""Private thread API schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


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
PRIVATE_THREAD_SELECTED_PLAINTEXT_MAX = 500_000

ThreadIntent = Literal["ask", "append", "replace_selection", "edit"]

ThreadStreamCommand = Literal["none", "improve", "critique"]


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
    selection_from: int | None = Field(
        default=None,
        ge=0,
        description="Start offset (UTF-16 code units) into current_section_plaintext.",
    )
    selection_to: int | None = Field(
        default=None,
        ge=0,
        description="End offset (exclusive, UTF-16) into current_section_plaintext.",
    )
    selected_plaintext: str | None = Field(
        default=None,
        max_length=PRIVATE_THREAD_SELECTED_PLAINTEXT_MAX,
        description="Optional; must match snapshot[selection_from:selection_to] when provided.",
    )
    include_selection_in_context: bool = Field(
        default=True,
        description="When false, selection bounds are ignored for RAG (still validated if sent).",
    )
    thread_intent: ThreadIntent = Field(
        default="ask",
        description="ask = chat only; other intents request a structured patch proposal after the reply.",
    )
    command: ThreadStreamCommand = Field(
        default="none",
        description="Framing for the assistant; only supported when thread_intent is ask.",
    )

    @model_validator(mode="after")
    def selection_both_or_neither(self) -> PrivateThreadStreamBody:
        has_from = self.selection_from is not None
        has_to = self.selection_to is not None
        if has_from != has_to:
            raise ValueError("selection_from and selection_to must both be set or both omitted.")
        if has_from and self.selection_from is not None and self.selection_to is not None:
            if self.selection_from > self.selection_to:
                raise ValueError("selection_from must be <= selection_to.")
        if self.command != "none" and self.thread_intent != "ask":
            raise ValueError("command is only supported when thread_intent is ask.")
        return self
