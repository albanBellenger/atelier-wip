"""Append-only timeline for the software dashboard."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Project, SoftwareActivityEvent, User
from app.schemas.software_activity import SoftwareActivityItemOut


class SoftwareActivityService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def record(
        self,
        *,
        software_id: uuid.UUID,
        studio_id: uuid.UUID,
        actor_user_id: uuid.UUID | None,
        verb: str,
        summary: str,
        entity_type: str | None = None,
        entity_id: uuid.UUID | None = None,
    ) -> None:
        ev = SoftwareActivityEvent(
            id=uuid.uuid4(),
            software_id=software_id,
            studio_id=studio_id,
            actor_user_id=actor_user_id,
            verb=verb,
            entity_type=entity_type,
            entity_id=entity_id,
            summary=summary,
        )
        self.db.add(ev)
        await self.db.flush()

    async def list_for_software(
        self, software_id: uuid.UUID, *, limit: int = 30
    ) -> list[SoftwareActivityEvent]:
        lim = max(1, min(limit, 100))
        q = (
            select(SoftwareActivityEvent)
            .where(SoftwareActivityEvent.software_id == software_id)
            .order_by(SoftwareActivityEvent.created_at.desc())
            .limit(lim)
        )
        return list((await self.db.execute(q)).scalars().all())

    async def list_activity_items_out(
        self, software_id: uuid.UUID, *, limit: int = 30
    ) -> list[SoftwareActivityItemOut]:
        rows = await self.list_for_software(software_id, limit=limit)
        actor_ids = {r.actor_user_id for r in rows if r.actor_user_id is not None}
        project_ids = {
            r.entity_id
            for r in rows
            if r.entity_type == "project" and r.entity_id is not None
        }
        users: dict[uuid.UUID, str] = {}
        if actor_ids:
            uq = select(User.id, User.display_name).where(User.id.in_(actor_ids))
            for uid, dname in (await self.db.execute(uq)).all():
                users[uid] = str(dname)
        projects: dict[uuid.UUID, str] = {}
        if project_ids:
            pq = select(Project.id, Project.name).where(
                Project.id.in_(project_ids),
                Project.software_id == software_id,
            )
            for pid, name in (await self.db.execute(pq)).all():
                projects[pid] = str(name)
        out: list[SoftwareActivityItemOut] = []
        for r in rows:
            actor_display = (
                users[r.actor_user_id] if r.actor_user_id is not None else None
            )
            context_label: str | None = None
            if r.entity_type == "project" and r.entity_id is not None:
                context_label = projects.get(r.entity_id)
            if context_label is None:
                context_label = "Software-level"
            out.append(
                SoftwareActivityItemOut(
                    id=r.id,
                    verb=r.verb,
                    summary=r.summary,
                    actor_user_id=r.actor_user_id,
                    entity_type=r.entity_type,
                    entity_id=r.entity_id,
                    created_at=r.created_at,
                    actor_display=actor_display,
                    context_label=context_label,
                )
            )
        return out
