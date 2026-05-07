"""Cross-studio access requests (resolved by the target software's Studio Owner)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import StudioAccess, ensure_studio_owner_membership
from app.exceptions import ApiError
from app.models import CrossStudioAccess, Software, Studio, User
from app.schemas.cross_studio import (
    CrossStudioIncomingRow,
    CrossStudioOutgoingRow,
    CrossStudioRequestCreate,
    CrossStudioRequestResult,
    CrossStudioResolveBody,
)


class CrossStudioService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_request(
        self,
        access: StudioAccess,
        body: CrossStudioRequestCreate,
    ) -> CrossStudioRequestResult:
        if not access.is_studio_admin:
            raise ApiError(
                status_code=403,
                code="FORBIDDEN",
                message="Studio Owner access required",
            )
        requesting_studio_id = access.studio_id
        sw = await self.db.get(Software, body.target_software_id)
        if sw is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Software not found",
            )
        if sw.studio_id == requesting_studio_id:
            raise ApiError(
                status_code=400,
                code="INVALID_TARGET",
                message="Cross-studio access must target software owned by another studio.",
            )
        dup = (
            await self.db.execute(
                select(CrossStudioAccess.id).where(
                    CrossStudioAccess.requesting_studio_id == requesting_studio_id,
                    CrossStudioAccess.target_software_id == body.target_software_id,
                    CrossStudioAccess.status == "pending",
                )
            )
        ).scalar_one_or_none()
        if dup is not None:
            raise ApiError(
                status_code=409,
                code="REQUEST_EXISTS",
                message="A pending request already exists for this software.",
            )
        row = CrossStudioAccess(
            id=uuid.uuid4(),
            requesting_studio_id=requesting_studio_id,
            target_software_id=body.target_software_id,
            requested_by=access.user.id,
            approved_by=None,
            access_level=body.requested_access_level,
            status="pending",
            resolved_at=None,
            resolved_by_studio_id=None,
        )
        self.db.add(row)
        await self.db.flush()
        return CrossStudioRequestResult(
            id=row.id, status=row.status, access_level=row.access_level
        )

    async def list_pending_for_software_owner(
        self,
        *,
        owner_studio_id: uuid.UUID,
        status: str | None,
        limit: int,
    ) -> list[CrossStudioIncomingRow]:
        stmt = (
            select(CrossStudioAccess)
            .join(Software, CrossStudioAccess.target_software_id == Software.id)
            .where(Software.studio_id == owner_studio_id)
            .order_by(CrossStudioAccess.created_at.desc())
        )
        if status:
            stmt = stmt.where(CrossStudioAccess.status == status)
        stmt = stmt.limit(limit)
        grants = list((await self.db.execute(stmt)).scalars().all())
        out: list[CrossStudioIncomingRow] = []
        for g in grants:
            rs = await self.db.get(Studio, g.requesting_studio_id)
            sw = await self.db.get(Software, g.target_software_id)
            ur = await self.db.get(User, g.requested_by)
            out.append(
                CrossStudioIncomingRow(
                    id=g.id,
                    requesting_studio_name=rs.name if rs else "?",
                    requester_email=ur.email if ur else "?",
                    target_software_name=sw.name if sw else "?",
                    access_level=g.access_level,
                    status=g.status,
                    created_at=g.created_at,
                    resolved_at=g.resolved_at,
                )
            )
        return out

    async def list_by_requesting_studio(
        self,
        *,
        requesting_studio_id: uuid.UUID,
        limit: int,
    ) -> list[CrossStudioOutgoingRow]:
        stmt = (
            select(CrossStudioAccess)
            .where(CrossStudioAccess.requesting_studio_id == requesting_studio_id)
            .order_by(CrossStudioAccess.created_at.desc())
            .limit(limit)
        )
        grants = list((await self.db.execute(stmt)).scalars().all())
        out: list[CrossStudioOutgoingRow] = []
        for g in grants:
            sw = await self.db.get(Software, g.target_software_id)
            os_row = await self.db.get(Studio, sw.studio_id) if sw else None
            out.append(
                CrossStudioOutgoingRow(
                    id=g.id,
                    target_software_name=sw.name if sw else "?",
                    owner_studio_name=os_row.name if os_row else "?",
                    access_level=g.access_level,
                    status=g.status,
                    created_at=g.created_at,
                    resolved_at=g.resolved_at,
                )
            )
        return out

    async def resolve(
        self,
        grant_id: uuid.UUID,
        *,
        owner_studio_id: uuid.UUID,
        acting_user: User,
        body: CrossStudioResolveBody,
    ) -> CrossStudioRequestResult:
        await ensure_studio_owner_membership(
            self.db, user_id=acting_user.id, studio_id=owner_studio_id
        )
        row = await self.db.get(CrossStudioAccess, grant_id)
        if row is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Access request not found",
            )
        sw = await self.db.get(Software, row.target_software_id)
        if sw is None or sw.studio_id != owner_studio_id:
            raise ApiError(
                status_code=403,
                code="FORBIDDEN",
                message="This request does not target software owned by your studio.",
            )
        now = datetime.now(timezone.utc)
        if body.decision == "reject":
            if row.status != "pending":
                raise ApiError(
                    status_code=400,
                    code="INVALID_STATE",
                    message="Only pending requests can be rejected.",
                )
            row.status = "rejected"
            row.resolved_at = now
            row.approved_by = acting_user.id
            row.resolved_by_studio_id = owner_studio_id
            await self.db.flush()
            return CrossStudioRequestResult(
                id=row.id, status=row.status, access_level=row.access_level
            )
        if body.decision == "approve":
            if row.status != "pending":
                raise ApiError(
                    status_code=400,
                    code="INVALID_STATE",
                    message="Only pending requests can be approved.",
                )
            level = body.access_level or row.access_level
            if level not in ("viewer", "external_editor"):
                raise ApiError(
                    status_code=400,
                    code="INVALID_LEVEL",
                    message="Invalid access level.",
                )
            row.access_level = level
            row.status = "approved"
            row.approved_by = acting_user.id
            row.resolved_at = now
            row.resolved_by_studio_id = owner_studio_id
            await self.db.flush()
            return CrossStudioRequestResult(
                id=row.id, status=row.status, access_level=row.access_level
            )
        # revoke
        if row.status != "approved":
            raise ApiError(
                status_code=400,
                code="INVALID_STATE",
                message="Only approved grants can be revoked.",
            )
        row.status = "revoked"
        row.resolved_at = now
        row.approved_by = acting_user.id
        row.resolved_by_studio_id = owner_studio_id
        await self.db.flush()
        return CrossStudioRequestResult(
            id=row.id, status=row.status, access_level=row.access_level
        )
