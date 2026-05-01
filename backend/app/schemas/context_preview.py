"""API schemas for RAG context preview (Slice B)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

ContextBlockKind = Literal[
    "software_def",
    "outline",
    "current_section",
    "other_section",
    "artifact_chunk",
    "git_history",
    "retrieved_header",
]


class ContextBlockOut(BaseModel):
    label: str
    kind: ContextBlockKind
    tokens: int = Field(ge=0, description="Approximate tokens (chars/4)")
    relevance: float | None = Field(
        default=None, description="Cosine distance for retrieved chunks; null for mandatory"
    )
    truncated: bool = False
    body: str = Field(description="Markdown fragment included in context")


class ContextPreviewOut(BaseModel):
    blocks: list[ContextBlockOut]
    total_tokens: int = Field(ge=0)
    budget_tokens: int = Field(ge=0)
    overflow_strategy_applied: str | None = Field(
        default=None,
        description="Which global overflow strategy was applied, if any",
    )
