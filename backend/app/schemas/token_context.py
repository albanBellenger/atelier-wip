"""Shared context for LLM calls (token accounting)."""

from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True, slots=True)
class TokenContext:
    studio_id: UUID
    software_id: UUID | None = None
    project_id: UUID | None = None
    work_order_id: UUID | None = None
    user_id: UUID | None = None
