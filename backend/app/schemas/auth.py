"""Pydantic schemas for auth and admin."""

from uuid import UUID

from typing import Self

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

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
    is_platform_admin: bool


class UserPublicWithAdmin(UserPublic):
    pass  # already has is_platform_admin


class AdminStatusUpdate(BaseModel):
    """PUT ``/admin/users/{user_id}/admin-status``."""

    is_platform_admin: bool


class StudioMembershipPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    studio_id: UUID
    studio_name: str
    role: str


class CrossStudioGrantPublic(BaseModel):
    """Approved cross-studio software access for the current user."""

    grant_id: UUID
    target_software_id: UUID
    owner_studio_id: UUID
    owner_studio_name: str
    software_name: str
    access_level: str


class MeResponse(BaseModel):
    user: UserPublic
    studios: list[StudioMembershipPublic]
    cross_studio_grants: list[CrossStudioGrantPublic] = []


class LlmRuntimePublic(BaseModel):
    """Read-only LLM identity for authenticated users (no keys or base URLs)."""

    llm_provider: str | None = None
    llm_model: str | None = None


class UserProfilePatch(BaseModel):
    """PATCH /auth/me — v1: display name only."""

    display_name: str = Field(min_length=1, max_length=255)


class AdminLlmProbeBody(BaseModel):
    """Optional overrides for ``POST /admin/test/llm`` (defaults from default registry row)."""

    model: str | None = None
    api_base_url: str | None = None
    provider_id: str | None = None

    @field_validator("api_base_url", mode="before")
    @classmethod
    def normalize_probe_api_base(cls, v: object) -> str | None:
        if v is None:
            return None
        if not isinstance(v, str):
            return None
        s = v.strip().rstrip("/")
        if not s:
            return None
        if not (s.startswith("http://") or s.startswith("https://")):
            raise ValueError("API base URL must start with http:// or https://")
        return s


class AdminEmbeddingProbeBody(BaseModel):
    """Optional overrides for ``POST /admin/test/embedding`` (scoped registry probe).

    When both ``provider_id`` and ``model`` are omitted, the probe uses embeddings routing
    (same as legacy behaviour). When both are set, the probe targets that registry row and
    model id without consulting routing rules.
    """

    provider_id: str | None = None
    model: str | None = None

    @model_validator(mode="after")
    def provider_and_model_together(self) -> Self:
        p = (self.provider_id or "").strip()
        m = (self.model or "").strip()
        if bool(p) != bool(m):
            raise ValueError("provider_id and model must both be set or both omitted.")
        return self


class AdminConnectivityResult(BaseModel):
    """Result of a tool-admin connectivity probe (LLM or embeddings)."""

    ok: bool
    message: str
    detail: str | None = None
