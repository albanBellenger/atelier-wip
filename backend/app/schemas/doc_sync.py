"""Doc sync (Work Order → Software Docs suggestions)."""

from pydantic import BaseModel, Field


class DocSyncRunResult(BaseModel):
    proposals_total: int = Field(ge=0, default=0)
    proposals_kept: int = Field(ge=0, default=0)
    proposals_dropped: int = Field(ge=0, default=0)
    skipped_reason: str | None = None
