"""Cross-studio access request schemas."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CrossStudioRequestCreate(BaseModel):
    target_software_id: UUID
    requested_access_level: Literal["viewer", "external_editor"] = "viewer"


class CrossStudioAccessPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    requesting_studio_id: UUID
    target_software_id: UUID
    requested_by: UUID
    access_level: str
    status: str
    created_at: datetime
    resolved_at: datetime | None = None


class CrossStudioIncomingRow(BaseModel):
    """Pending / resolved row for the target studio's Studio Owners (incoming requests)."""

    id: UUID
    requesting_studio_name: str
    requester_email: str
    target_software_name: str
    access_level: str
    status: str
    created_at: datetime
    resolved_at: datetime | None = None


class CrossStudioOutgoingRow(BaseModel):
    """Outbound cross-studio requests originated by the requesting studio."""

    id: UUID
    target_software_name: str
    owner_studio_name: str
    access_level: str
    status: str
    created_at: datetime
    resolved_at: datetime | None = None


class CrossStudioResolveBody(BaseModel):
    decision: Literal["approve", "reject", "revoke"]
    """For approve, optional override (defaults to requested access_level on row)."""

    access_level: Literal["viewer", "external_editor"] | None = Field(
        default=None,
        description="Effective grant level when approving.",
    )


class CrossStudioRequestResult(BaseModel):
    id: UUID
    status: str
    access_level: str
