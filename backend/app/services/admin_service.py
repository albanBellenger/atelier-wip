"""Tool admin configuration for LLM and embedding providers."""

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ApiError
from app.models import AdminConfig, User
from app.schemas.auth import AdminConfigResponse, AdminConfigUpdate, UserPublic


def _mask(s: str | None) -> bool:
    return bool(s and s.strip())


class AdminService:
    """CRUD for singleton `admin_config` row (id=1)."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_or_create(self) -> AdminConfig:
        row = await self.db.get(AdminConfig, 1)
        if row is None:
            row = AdminConfig(id=1)
            self.db.add(row)
            await self.db.flush()
        return row

    async def get_public(self) -> AdminConfigResponse:
        row = await self.get_or_create()
        return AdminConfigResponse(
            llm_provider=row.llm_provider,
            llm_model=row.llm_model,
            llm_api_key_set=_mask(row.llm_api_key),
            embedding_provider=row.embedding_provider,
            embedding_model=row.embedding_model,
            embedding_api_key_set=_mask(row.embedding_api_key),
        )

    async def update(self, body: AdminConfigUpdate) -> AdminConfigResponse:
        row = await self.get_or_create()
        data = body.model_dump(exclude_unset=True)
        for key, value in data.items():
            setattr(row, key, value)
        await self.db.flush()
        return await self.get_public()

    async def set_admin_status(
        self,
        target_user_id: UUID,
        is_tool_admin: bool,
        requesting_user: User,
    ) -> UserPublic:
        if target_user_id == requesting_user.id and is_tool_admin is False:
            raise ApiError(
                status_code=400,
                code="SELF_REVOCATION_BLOCKED",
                message="A Tool Admin cannot revoke their own admin status.",
            )
        target_user = await self.db.get(User, target_user_id)
        if target_user is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="User not found.",
            )
        target_user.is_tool_admin = is_tool_admin
        self.db.add(target_user)
        await self.db.flush()
        return UserPublic.model_validate(target_user)
