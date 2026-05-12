"""Issue panel API."""

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict


class IssueResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID | None = None
    software_id: uuid.UUID | None = None
    work_order_id: uuid.UUID | None = None
    kind: str = "conflict_or_gap"
    triggered_by: uuid.UUID | None = None
    section_a_id: uuid.UUID | None = None
    section_b_id: uuid.UUID | None = None
    description: str
    status: str
    origin: str
    run_actor_id: uuid.UUID | None = None
    payload_json: dict[str, Any] | None = None
    resolution_reason: str | None = None
    created_at: datetime


class IssueUpdateBody(BaseModel):
    status: Literal["open", "resolved"]
    resolution_reason: str | None = None


class AnalyzeResponse(BaseModel):
    issues_created: int
