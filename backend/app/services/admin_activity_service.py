"""Persist deployment-wide activity rows for tool admins."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import DeploymentActivity


class AdminActivityService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def record(
        self,
        *,
        action: str,
        actor_user_id: uuid.UUID | None,
        target_type: str | None = None,
        target_id: uuid.UUID | None = None,
        summary: str | None = None,
        payload: dict[str, Any] | None = None,
    ) -> DeploymentActivity:
        row = DeploymentActivity(
            id=uuid.uuid4(),
            actor_user_id=actor_user_id,
            action=action[:64],
            target_type=(target_type[:64] if target_type else None),
            target_id=target_id,
            summary=summary,
            payload=payload,
        )
        self.db.add(row)
        await self.db.flush()
        return row

    async def list_recent(
        self, *, limit: int = 50, offset: int = 0
    ) -> tuple[list[DeploymentActivity], int]:
        total = await self.db.scalar(select(func.count()).select_from(DeploymentActivity))
        q = (
            select(DeploymentActivity)
            .order_by(DeploymentActivity.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        rows = list((await self.db.execute(q)).scalars().all())
        return rows, int(total or 0)
