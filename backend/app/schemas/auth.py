"""Pydantic schemas for auth and admin."""

from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserCreate(BaseModel):
    """POST /auth/register"""

    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=255)


class UserLogin(BaseModel):
    """POST /auth/login"""

    email: EmailStr
    password: str = Field(min_length=1)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    display_name: str
    is_tool_admin: bool


class StudioMembershipPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    studio_id: UUID
    studio_name: str
    role: str


class MeResponse(BaseModel):
    user: UserPublic
    studios: list[StudioMembershipPublic]


class AdminConfigResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    llm_provider: str | None
    llm_model: str | None
    llm_api_key_set: bool
    embedding_provider: str | None
    embedding_model: str | None
    embedding_api_key_set: bool


class AdminConfigUpdate(BaseModel):
    llm_provider: str | None = None
    llm_model: str | None = None
    llm_api_key: str | None = None
    embedding_provider: str | None = None
    embedding_model: str | None = None
    embedding_api_key: str | None = None
