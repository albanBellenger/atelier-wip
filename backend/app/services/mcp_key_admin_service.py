"""Studio Owner — MCP API keys (Slice 12)."""

from __future__ import annotations

import secrets
import uuid

import bcrypt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import StudioAccess
from app.exceptions import ApiError
from app.models import McpKey
from app.schemas.mcp_keys import McpKeyCreateBody, McpKeyCreatedResponse, McpKeyPublic


class McpKeyAdminService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list_keys(self, access: StudioAccess) -> list[McpKeyPublic]:
        if not access.is_studio_admin:
            raise ApiError(
                status_code=403,
                code="FORBIDDEN",
                message="Studio Owner access required",
            )
        rows = (
            (
                await self.db.execute(
                    select(McpKey)
                    .where(McpKey.studio_id == access.studio_id)
                    .order_by(McpKey.created_at.desc())
                )
            )
            .scalars()
            .all()
        )
        return [self._public(r) for r in rows]

    def _public(self, r: McpKey) -> McpKeyPublic:
        return McpKeyPublic(
            id=r.id,
            label=r.label,
            access_level=r.access_level,
            created_at=r.created_at,
            last_used_at=r.last_used_at,
            revoked_at=r.revoked_at,
        )

    async def create_key(
        self,
        access: StudioAccess,
        body: McpKeyCreateBody,
    ) -> McpKeyCreatedResponse:
        if not access.is_studio_admin:
            raise ApiError(
                status_code=403,
                code="FORBIDDEN",
                message="Studio Owner access required",
            )
        raw = "atelier_" + secrets.token_urlsafe(24)
        hashed = bcrypt.hashpw(raw.encode("utf-8"), bcrypt.gensalt()).decode("ascii")
        row = McpKey(
            id=uuid.uuid4(),
            studio_id=access.studio_id,
            user_id=access.user.id,
            label=body.label.strip()[:255],
            key_hash=hashed,
            access_level=body.access_level,
        )
        self.db.add(row)
        await self.db.flush()
        pub = self._public(row)
        return McpKeyCreatedResponse(**pub.model_dump(), secret=raw)

    async def revoke_key(self, access: StudioAccess, key_id: uuid.UUID) -> None:
        if not access.is_studio_admin:
            raise ApiError(
                status_code=403,
                code="FORBIDDEN",
                message="Studio Owner access required",
            )
        row = await self.db.get(McpKey, key_id)
        if row is None or row.studio_id != access.studio_id:
            raise ApiError(404, "NOT_FOUND", "MCP key not found")
        from datetime import datetime, timezone

        row.revoked_at = datetime.now(timezone.utc)
        await self.db.flush()
