"""Auth business logic."""

import uuid
from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import AppError
from app.models import Studio, StudioMember, User
from app.schemas.auth import (
    MeResponse,
    RegisterRequest,
    StudioMembershipPublic,
    TokenResponse,
    UserPublic,
)
from app.security.jwt import create_access_token, decode_access_token
from app.security.passwords import hash_password, verify_password


class AuthService:
    """Register, login, and current-user resolution."""

    @staticmethod
    async def register(session: AsyncSession, body: RegisterRequest) -> TokenResponse:
        result = await session.execute(select(User).where(User.email == body.email.lower().strip()))
        existing = result.scalar_one_or_none()
        if existing:
            raise AppError(
                code="EMAIL_IN_USE",
                message="An account with this email already exists",
                status_code=409,
            )
        n_users = await session.scalar(select(func.count()).select_from(User)) or 0
        is_tool_admin = (n_users or 0) == 0
        user = User(
            id=uuid.uuid4(),
            email=body.email.lower().strip(),
            password_hash=hash_password(body.password),
            display_name=body.display_name.strip(),
            is_tool_admin=is_tool_admin,
        )
        session.add(user)
        await session.flush()
        token = create_access_token(user.id)
        return TokenResponse(access_token=token)

    @staticmethod
    async def login(session: AsyncSession, email: str, password: str) -> TokenResponse:
        result = await session.execute(select(User).where(User.email == email.lower().strip()))
        user = result.scalar_one_or_none()
        if not user or not verify_password(password, user.password_hash):
            raise AppError(
                code="INVALID_CREDENTIALS",
                message="Invalid email or password",
                status_code=401,
            )
        return TokenResponse(access_token=create_access_token(user.id))

    @staticmethod
    async def me(session: AsyncSession, user: User) -> MeResponse:
        q = (
            select(StudioMember, Studio)
            .join(Studio, StudioMember.studio_id == Studio.id)
            .where(StudioMember.user_id == user.id)
        )
        rows: Sequence[tuple[StudioMember, Studio]] = (await session.execute(q)).all()
        studios = [
            StudioMembershipPublic(
                studio_id=st.id,
                studio_name=st.name,
                role=m.role,
            )
            for m, st in rows
        ]
        return MeResponse(
            user=UserPublic.model_validate(user),
            studios=studios,
        )

    @staticmethod
    async def get_user_from_token(session: AsyncSession, token: str) -> User:
        try:
            uid = decode_access_token(token)
        except ValueError:
            raise AppError(
                code="INVALID_TOKEN",
                message="Invalid or expired token",
                status_code=401,
            ) from None
        user = await session.get(User, uid)
        if not user:
            raise AppError(code="USER_NOT_FOUND", message="User no longer exists", status_code=401)
        return user
