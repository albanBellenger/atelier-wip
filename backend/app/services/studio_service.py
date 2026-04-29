"""Studio and member business logic."""

import uuid
from collections.abc import Sequence

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import StudioAccess
from app.exceptions import ApiError
from app.models import Studio, StudioMember, User
from app.schemas.studio import (
    MemberInvite,
    MemberRoleUpdate,
    StudioCreate,
    StudioMemberResponse,
    StudioResponse,
    StudioUpdate,
)


class StudioService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list_studios(self, user: User) -> list[StudioResponse]:
        if user.is_tool_admin:
            q = (
                select(
                    Studio.id,
                    Studio.name,
                    Studio.description,
                    Studio.logo_path,
                    Studio.created_at,
                )
                .order_by(Studio.name)
            )
        else:
            q = (
                select(
                    Studio.id,
                    Studio.name,
                    Studio.description,
                    Studio.logo_path,
                    Studio.created_at,
                )
                .join(StudioMember, StudioMember.studio_id == Studio.id)
                .where(StudioMember.user_id == user.id)
                .order_by(Studio.name)
            )
        rows = (await self.db.execute(q)).all()
        return [
            StudioResponse(
                id=r.id,
                name=r.name,
                description=r.description,
                logo_path=r.logo_path,
                created_at=r.created_at,
            )
            for r in rows
        ]

    async def create_studio(self, user: User, body: StudioCreate) -> StudioResponse:
        studio = Studio(
            id=uuid.uuid4(),
            name=body.name.strip(),
            description=body.description.strip() if body.description else None,
        )
        self.db.add(studio)
        await self.db.flush()
        self.db.add(
            StudioMember(
                studio_id=studio.id,
                user_id=user.id,
                role="studio_admin",
            )
        )
        await self.db.commit()
        await self.db.refresh(studio)
        return StudioResponse.model_validate(studio)

    async def get_studio(self, access: StudioAccess) -> StudioResponse:
        row = await self.db.get(Studio, access.studio_id)
        assert row is not None
        return StudioResponse.model_validate(row)

    async def update_studio(
        self, access: StudioAccess, body: StudioUpdate
    ) -> StudioResponse:
        row = await self.db.get(Studio, access.studio_id)
        assert row is not None
        if body.name is not None:
            row.name = body.name.strip()
        if body.description is not None:
            row.description = (
                body.description.strip() if body.description else None
            )
        await self.db.commit()
        await self.db.refresh(row)
        return StudioResponse.model_validate(row)

    async def delete_studio(self, access: StudioAccess) -> None:
        row = await self.db.get(Studio, access.studio_id)
        if row is None:
            return
        await self.db.delete(row)
        await self.db.commit()

    async def list_members(self, access: StudioAccess) -> list[StudioMemberResponse]:
        q = (
            select(
                StudioMember.user_id,
                User.email,
                User.display_name,
                StudioMember.role,
                StudioMember.joined_at,
            )
            .join(User, User.id == StudioMember.user_id)
            .where(StudioMember.studio_id == access.studio_id)
            .order_by(User.email)
        )
        rows: Sequence[tuple] = (await self.db.execute(q)).all()
        return [
            StudioMemberResponse(
                user_id=t[0],
                email=t[1],
                display_name=t[2],
                role=t[3],
                joined_at=t[4],
            )
            for t in rows
        ]

    async def add_member(
        self, access: StudioAccess, body: MemberInvite
    ) -> StudioMemberResponse:
        uid = await self.db.scalar(
            select(User.id).where(User.email == body.email.lower().strip())
        )
        if uid is None:
            raise ApiError(
                status_code=404,
                code="USER_NOT_FOUND",
                message="No registered user with this email",
            )
        existing = await self.db.scalar(
            select(StudioMember.user_id).where(
                StudioMember.studio_id == access.studio_id,
                StudioMember.user_id == uid,
            )
        )
        if existing is not None:
            raise ApiError(
                status_code=409,
                code="ALREADY_MEMBER",
                message="User is already a member of this studio",
            )
        self.db.add(
            StudioMember(
                studio_id=access.studio_id,
                user_id=uid,
                role=body.role,
            )
        )
        await self.db.commit()
        row = (
            await self.db.execute(
                select(
                    StudioMember.user_id,
                    User.email,
                    User.display_name,
                    StudioMember.role,
                    StudioMember.joined_at,
                )
                .join(User, User.id == StudioMember.user_id)
                .where(
                    StudioMember.studio_id == access.studio_id,
                    StudioMember.user_id == uid,
                )
            )
        ).one()
        return StudioMemberResponse(
            user_id=row.user_id,
            email=row.email,
            display_name=row.display_name,
            role=row.role,
            joined_at=row.joined_at,
        )

    async def remove_member(
        self, access: StudioAccess, user_id: uuid.UUID
    ) -> None:
        if user_id == access.user.id:
            raise ApiError(
                status_code=400,
                code="CANNOT_REMOVE_SELF",
                message="Cannot remove yourself from the studio",
            )
        n_admins = await self.db.scalar(
            select(func.count())
            .select_from(StudioMember)
            .where(
                StudioMember.studio_id == access.studio_id,
                StudioMember.role == "studio_admin",
            )
        )
        target = await self.db.execute(
            select(StudioMember.role).where(
                StudioMember.studio_id == access.studio_id,
                StudioMember.user_id == user_id,
            )
        )
        tr = target.scalar_one_or_none()
        if tr is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Member not found in this studio",
            )
        if tr == "studio_admin" and (n_admins or 0) <= 1:
            raise ApiError(
                status_code=400,
                code="LAST_ADMIN",
                message="Cannot remove the last studio admin",
            )
        await self.db.execute(
            delete(StudioMember).where(
                StudioMember.studio_id == access.studio_id,
                StudioMember.user_id == user_id,
            )
        )
        await self.db.commit()

    async def update_member_role(
        self, access: StudioAccess, user_id: uuid.UUID, body: MemberRoleUpdate
    ) -> StudioMemberResponse:
        n_admins = await self.db.scalar(
            select(func.count())
            .select_from(StudioMember)
            .where(
                StudioMember.studio_id == access.studio_id,
                StudioMember.role == "studio_admin",
            )
        )
        current = await self.db.scalar(
            select(StudioMember.role).where(
                StudioMember.studio_id == access.studio_id,
                StudioMember.user_id == user_id,
            )
        )
        if current is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Member not found in this studio",
            )
        if (
            current == "studio_admin"
            and body.role == "studio_member"
            and (n_admins or 0) <= 1
        ):
            raise ApiError(
                status_code=400,
                code="LAST_ADMIN",
                message="Cannot demote the last studio admin",
            )
        await self.db.execute(
            update(StudioMember)
            .where(
                StudioMember.studio_id == access.studio_id,
                StudioMember.user_id == user_id,
            )
            .values(role=body.role)
        )
        await self.db.commit()
        row = (
            await self.db.execute(
                select(
                    StudioMember.user_id,
                    User.email,
                    User.display_name,
                    StudioMember.role,
                    StudioMember.joined_at,
                )
                .join(User, User.id == StudioMember.user_id)
                .where(
                    StudioMember.studio_id == access.studio_id,
                    StudioMember.user_id == user_id,
                )
            )
        ).one()
        return StudioMemberResponse(
            user_id=row.user_id,
            email=row.email,
            display_name=row.display_name,
            role=row.role,
            joined_at=row.joined_at,
        )
