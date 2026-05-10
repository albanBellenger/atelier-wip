"""Per-model entries stored in ``LlmProviderRegistry.models_json``."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

LlmRegistryModelKind = Literal["chat", "embedding"]


class LlmRegistryModelEntry(BaseModel):
    """One model on a provider row (chat or embedding), with optional context metadata."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=256)
    kind: LlmRegistryModelKind = "chat"
    max_context_tokens: int | None = Field(default=None, ge=1)
    context_metadata_source: Literal["litellm", "manual", "unknown"] = "unknown"
    context_metadata_checked_at: datetime | None = None

    @classmethod
    def from_legacy_string(cls, model_id: str) -> LlmRegistryModelEntry:
        return cls(
            id=model_id.strip(),
            kind="chat",
            max_context_tokens=None,
            context_metadata_source="unknown",
        )
