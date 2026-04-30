"""MCP key HTTP schemas."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class McpKeyCreateBody(BaseModel):
    label: str = Field(min_length=1, max_length=255)
    access_level: Literal["viewer", "editor"] = "editor"


class McpKeyPublic(BaseModel):
    id: uuid.UUID
    label: str
    access_level: str
    created_at: datetime
    last_used_at: datetime | None = None
    revoked_at: datetime | None = None

    model_config = {"from_attributes": True}


class McpKeyCreatedResponse(McpKeyPublic):
    secret: str = Field(description="Shown once; store securely.")
