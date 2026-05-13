"""Private thread API schemas."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


@dataclass(frozen=True)
class ThreadFinding:
    finding_type: Literal["conflict", "gap"]
    description: str

    def as_dict(self) -> dict[str, str]:
        return {"finding_type": self.finding_type, "description": self.description}


def normalize_thread_findings(scan: object) -> list[dict[str, str]]:
    if not isinstance(scan, dict):
        return []
    raw = scan.get("findings")
    if not isinstance(raw, list):
        return []
    out: list[dict[str, str]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        ft = item.get("finding_type")
        desc = str(item.get("description") or "").strip()
        if ft not in ("conflict", "gap") or not desc:
            continue
        out.append({"finding_type": str(ft), "description": desc})
    return out


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
    selected_plaintext: str | None = Field(
        default=None,
        max_length=PRIVATE_THREAD_SELECTED_PLAINTEXT_MAX,
        description="Optional editor selection text; must appear in current_section_plaintext.",
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
    preferred_model: str | None = Field(
        default=None,
        max_length=256,
        description="Optional chat model id; must be allowed for the studio (connected providers + policy).",
    )

    @model_validator(mode="after")
    def command_only_with_ask(self) -> PrivateThreadStreamBody:
        if self.command != "none" and self.thread_intent != "ask":
            raise ValueError("command is only supported when thread_intent is ask.")
        return self
