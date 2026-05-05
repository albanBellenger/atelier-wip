"""Deployment-wide user listing for tool admins."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Studio, StudioMember, User
from app.schemas.admin_console import AdminUserDirectoryRowResponse


class AdminUserDirectoryService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list_users(self, *, limit: int = 200, offset: int = 0) -> list[AdminUserDirectoryRowResponse]:
        q = (
            select(User)
            .order_by(User.email)
            .limit(limit)
            .offset(offset)
        )
        users = list((await self.db.execute(q)).scalars().all())
        out: list[AdminUserDirectoryRowResponse] = []
        for u in users:
            memberships = (
                (
                    await self.db.execute(
                        select(StudioMember, Studio.name)
                        .join(Studio, Studio.id == StudioMember.studio_id)
                        .where(StudioMember.user_id == u.id)
                    )
                )
                .all()
            )
            studios_payload: list[dict[str, str | UUID]] = [
                {
                    "studio_id": m[0].studio_id,
                    "studio_name": m[1],
                    "role": m[0].role,
                }
                for m in memberships
            ]
            out.append(
                AdminUserDirectoryRowResponse(
                    user_id=u.id,
                    email=u.email,
                    display_name=u.display_name,
                    is_tool_admin=u.is_tool_admin,
                    created_at=u.created_at,
                    studio_memberships=studios_payload,
                )
            )
        return out
