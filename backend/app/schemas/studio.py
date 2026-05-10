"""Studio and membership schemas."""

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class StudioCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None


class StudioUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None


class StudioResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    description: str | None
    logo_path: str | None
    created_at: datetime
    budget_cap_monthly_usd: Decimal | None = None
    budget_overage_action: str = "pause_generations"


class StudioListItemOut(StudioResponse):
    """GET /studios row with aggregate counts for the studio list UI."""

    software_count: int = 0
    project_count: int = 0
    member_count: int = 0


class StudioMemberResponse(BaseModel):
    user_id: UUID
    email: str
    display_name: str
    role: str
    joined_at: datetime


class MemberInvite(BaseModel):
    email: EmailStr
    role: Literal["studio_admin", "studio_member", "studio_viewer"] = "studio_member"


class MemberRoleUpdate(BaseModel):
    role: Literal["studio_admin", "studio_member", "studio_viewer"]
