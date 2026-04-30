"""Work order API schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator
from pydantic_core import PydanticCustomError


class WorkOrderNoteCreate(BaseModel):
    content: str = Field(..., min_length=1)


class WorkOrderNoteResponse(BaseModel):
    id: UUID
    author_id: UUID | None
    source: str
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


class WorkOrderCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=512)
    description: str = Field(..., min_length=1)
    implementation_guide: str | None = None
    acceptance_criteria: str | None = None
    status: str = Field(default="backlog", max_length=32)
    phase: str | None = Field(None, max_length=256)
    assignee_id: UUID | None = None
    section_ids: list[UUID] = Field(default_factory=list)

    @field_validator("section_ids")
    @classmethod
    def section_ids_non_empty(cls, v: list[UUID]) -> list[UUID]:
        if not v:
            raise PydanticCustomError(
                "SECTION_REQUIRED",
                "At least one section is required.",
                {},
            )
        return v


class WorkOrderUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=512)
    description: str | None = None
    implementation_guide: str | None = None
    acceptance_criteria: str | None = None
    status: str | None = Field(None, max_length=32)
    phase: str | None = Field(None, max_length=256)
    assignee_id: UUID | None = None
    section_ids: list[UUID] | None = None


class GenerateWorkOrdersBody(BaseModel):
    section_ids: list[UUID] = Field(..., min_length=1)


class WorkOrderResponse(BaseModel):
    id: UUID
    project_id: UUID
    title: str
    description: str
    implementation_guide: str | None
    acceptance_criteria: str | None
    status: str
    phase: str | None
    assignee_id: UUID | None
    assignee_display_name: str | None = None
    is_stale: bool
    stale_reason: str | None
    created_by: UUID | None
    created_at: datetime
    updated_at: datetime
    section_ids: list[UUID] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class WorkOrderDetailResponse(WorkOrderResponse):
    notes: list[WorkOrderNoteResponse] = Field(default_factory=list)
