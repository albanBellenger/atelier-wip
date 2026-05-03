"""Auth business logic."""

import uuid
from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ApiError
from app.models import (
    CrossStudioAccess,
    Software,
    Studio,
    StudioMember,
    User,
)
from app.schemas.auth import (
    CrossStudioGrantPublic,
    LlmRuntimePublic,
    MeResponse,
    StudioMembershipPublic,
    UserCreate,
    UserProfilePatch,
    UserPublic,
)
from app.security.jwt import create_access_token, decode_access_token
from app.security.passwords import hash_password, verify_password


class AuthService:
    """Register, login, and current-user resolution."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def register(self, body: UserCreate) -> str:
        existing_id = await self.db.scalar(
            select(User.id).where(User.email == body.email.lower().strip())
        )
        if existing_id is not None:
            raise ApiError(
                status_code=409,
                code="EMAIL_IN_USE",
                message="An account with this email already exists",
            )
        n_users = await self.db.scalar(select(func.count()).select_from(User)) or 0
        is_tool_admin = (n_users or 0) == 0
        user = User(
            id=uuid.uuid4(),
            email=body.email.lower().strip(),
            password_hash=hash_password(body.password),
            display_name=body.display_name.strip(),
            is_tool_admin=is_tool_admin,
        )
        self.db.add(user)
        await self.db.flush()
        return create_access_token(user.id)

    async def login(self, email: str, password: str) -> str:
        row = (
            await self.db.execute(
                select(User.id, User.password_hash).where(
                    User.email == email.lower().strip()
                )
            )
        ).one_or_none()
        if row is None or not verify_password(password, row.password_hash):
            raise ApiError(
                status_code=401,
                code="INVALID_CREDENTIALS",
                message="Invalid email or password",
            )
        uid = row.id
        return create_access_token(uid)

    async def me(self, user: User) -> MeResponse:
        q = (
            select(StudioMember.studio_id, StudioMember.role, Studio.name)
            .join(Studio, StudioMember.studio_id == Studio.id)
            .where(StudioMember.user_id == user.id)
        )
        raw_rows: Sequence[tuple[uuid.UUID, str, str]] = (
            await self.db.execute(q)
        ).all()
        studios = [
            StudioMembershipPublic(
                studio_id=sid,
                studio_name=name,
                role=role,
            )
            for sid, role, name in raw_rows
        ]
        gq = (
            select(CrossStudioAccess, Software, Studio)
            .join(Software, CrossStudioAccess.target_software_id == Software.id)
            .join(Studio, Software.studio_id == Studio.id)
            .join(
                StudioMember,
                (StudioMember.studio_id == CrossStudioAccess.requesting_studio_id)
                & (StudioMember.user_id == user.id),
            )
            .where(CrossStudioAccess.status == "approved")
        )
        grant_rows = (await self.db.execute(gq)).all()
        cross_studio_grants = [
            CrossStudioGrantPublic(
                grant_id=g.id,
                target_software_id=g.target_software_id,
                owner_studio_id=st.id,
                owner_studio_name=st.name,
                software_name=sw.name,
                access_level=g.access_level,
            )
            for g, sw, st in grant_rows
        ]
        return MeResponse(
            user=UserPublic.model_validate(user),
            studios=studios,
            cross_studio_grants=cross_studio_grants,
        )

    async def llm_runtime_public(self) -> LlmRuntimePublic:
        from app.services.admin_service import AdminService

        row = await AdminService(self.db).get_or_create()
        return LlmRuntimePublic(
            llm_provider=row.llm_provider,
            llm_model=row.llm_model,
        )

    async def patch_profile(self, user: User, body: UserProfilePatch) -> MeResponse:
        row = await self.db.execute(select(User).where(User.id == user.id))
        db_user = row.scalar_one()
        name = body.display_name.strip()
        if not name:
            raise ApiError(
                status_code=422,
                code="VALIDATION_ERROR",
                message="Display name cannot be empty.",
            )
        if len(name) > 255:
            raise ApiError(
                status_code=422,
                code="VALIDATION_ERROR",
                message="Display name is too long.",
            )
        db_user.display_name = name
        await self.db.flush()
        return await self.me(db_user)

    async def get_user_from_token(self, token: str) -> User:
        try:
            uid = decode_access_token(token)
        except ValueError:
            raise ApiError(
                status_code=401,
                code="INVALID_TOKEN",
                message="Invalid or expired token",
            ) from None
        row = await self.db.execute(
            select(
                User.id,
                User.email,
                User.password_hash,
                User.display_name,
                User.is_tool_admin,
                User.created_at,
            ).where(User.id == uid)
        )
        t = row.one_or_none()
        if t is None:
            raise ApiError(
                status_code=401,
                code="USER_NOT_FOUND",
                message="User no longer exists",
            )
        return User(
            id=t.id,
            email=t.email,
            password_hash=t.password_hash,
            display_name=t.display_name,
            is_tool_admin=t.is_tool_admin,
            created_at=t.created_at,
        )
