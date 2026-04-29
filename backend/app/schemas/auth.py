"""Pydantic schemas for auth and admin."""

from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.security.passwords import BCRYPT_MAX_PASSWORD_BYTES


class UserCreate(BaseModel):
    """POST /auth/register"""

    email: EmailStr
    # bcrypt allows at most 72 UTF-8 bytes (stricter than character count for non-ASCII).
    password: str = Field(min_length=8)
    display_name: str = Field(min_length=1, max_length=255)

    @field_validator("password")
    @classmethod
    def password_within_bcrypt_byte_limit(cls, v: str) -> str:
        n = len(v.encode("utf-8"))
        if n > BCRYPT_MAX_PASSWORD_BYTES:
            raise ValueError(
                f"Password must be at most {BCRYPT_MAX_PASSWORD_BYTES} bytes in UTF-8 "
                f"(bcrypt limit; got {n} bytes). Use a shorter password."
            )
        return v


class UserLogin(BaseModel):
    """POST /auth/login"""

    email: EmailStr
    password: str = Field(min_length=1)


class TokenResponse(BaseModel):
    message: str = "ok"


class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    display_name: str
    is_tool_admin: bool


class AdminStatusUpdate(BaseModel):
    is_tool_admin: bool


class UserPublicWithAdmin(UserPublic):
    pass  # already has is_tool_admin


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
