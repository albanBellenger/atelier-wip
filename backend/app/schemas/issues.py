"""Issue panel API."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class IssueResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    triggered_by: uuid.UUID | None = None
    section_a_id: uuid.UUID | None = None
    section_b_id: uuid.UUID | None = None
    description: str
    status: str
    origin: str
    run_actor_id: uuid.UUID | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class IssueUpdateBody(BaseModel):
    status: Literal["open", "resolved"]


class AnalyzeResponse(BaseModel):
    issues_created: int
