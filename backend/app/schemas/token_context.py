"""Shared context for LLM calls (token accounting)."""

from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True, slots=True)
class TokenContext:
    studio_id: UUID
    software_id: UUID
    project_id: UUID
    user_id: UUID
