"""FastAPI dependencies: database session, JWT user, RBAC."""

from dataclasses import dataclass
from uuid import UUID

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.exceptions import ApiError
from app.models import Studio, StudioMember, User
from app.services.auth_service import AuthService


async def get_current_user(
    request: Request,
    session: AsyncSession = Depends(get_db),
) -> User:
    token = request.cookies.get("atelier_token")
    if not token:
        raise ApiError(
            status_code=401,
            code="UNAUTHORIZED",
            message="Not authenticated",
        )
    return await AuthService(session).get_user_from_token(token)


async def require_tool_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_tool_admin:
        raise ApiError(
            status_code=403,
            code="FORBIDDEN",
            message="Tool admin access required",
        )
    return user


@dataclass(frozen=True)
class StudioAccess:
    """Resolved access for a studio-scoped route."""

    user: User
    studio_id: UUID
    membership: StudioMember | None

    @property
    def is_studio_admin(self) -> bool:
        if self.user.is_tool_admin:
            return True
        return (
            self.membership is not None and self.membership.role == "studio_admin"
        )


async def get_studio_access(
    studio_id: UUID,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> StudioAccess:
    studio = await session.get(Studio, studio_id)
    if studio is None:
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message="Studio not found",
        )
    row = await session.execute(
        select(StudioMember).where(
            StudioMember.studio_id == studio_id,
            StudioMember.user_id == user.id,
        )
    )
    membership = row.scalar_one_or_none()
    if membership is None and not user.is_tool_admin:
        raise ApiError(
            status_code=403,
            code="NOT_STUDIO_MEMBER",
            message="Not a member of this studio",
        )
    return StudioAccess(
        user=user, studio_id=studio_id, membership=membership
    )


async def require_studio_admin(
    access: StudioAccess = Depends(get_studio_access),
) -> StudioAccess:
    if not access.is_studio_admin:
        raise ApiError(
            status_code=403,
            code="FORBIDDEN",
            message="Studio admin access required",
        )
    return access
