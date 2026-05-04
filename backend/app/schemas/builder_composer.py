"""Request/response for builder home composer LLM hint."""

from __future__ import annotations

import uuid

from pydantic import BaseModel, Field


class BuilderComposerHintBody(BaseModel):
    software_id: uuid.UUID
    project_id: uuid.UUID | None = None
    local_hour: int | None = Field(
        None,
        ge=0,
        le=23,
        description="Client local hour for time-of-day aware copy.",
    )


class BuilderComposerHintResponse(BaseModel):
    headline: str = Field(..., max_length=500)
    input_placeholder: str = Field(..., max_length=500)
