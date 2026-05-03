"""Create in-app ``Notification`` rows for domain events (writer side of inbox)."""

from __future__ import annotations

import uuid
from collections.abc import Iterable
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import notification_kinds as NK
from app.models import (
    Artifact,
    CrossStudioAccess,
    Project,
    Software,
    StudioMember,
)
from app.models.notification import Notification


async def list_software_editor_user_ids(
    session: AsyncSession, software_id: UUID
) -> list[UUID]:
    """Users with ``StudioAccess.is_studio_editor`` for this software (home + cross)."""
    sw = await session.get(Software, software_id)
    if sw is None:
        return []
    studio_id = sw.studio_id
    home = (
        await session.execute(
            select(StudioMember.user_id).where(StudioMember.studio_id == studio_id)
        )
    ).scalars().all()
    cross = (
        await session.execute(
            select(StudioMember.user_id)
            .select_from(StudioMember)
            .join(
                CrossStudioAccess,
                CrossStudioAccess.requesting_studio_id == StudioMember.studio_id,
            )
            .where(
                CrossStudioAccess.target_software_id == software_id,
                CrossStudioAccess.status == "approved",
                CrossStudioAccess.access_level == "external_editor",
            )
        )
    ).scalars().all()
    return list(set(home) | set(cross))


async def list_project_editor_user_ids(
    session: AsyncSession, project_id: UUID
) -> list[UUID]:
    pr = await session.get(Project, project_id)
    if pr is None:
        return []
    return await list_software_editor_user_ids(session, pr.software_id)


async def list_studio_editor_user_ids(
    session: AsyncSession, studio_id: UUID
) -> list[UUID]:
    """Editors on the owning studio only (studio-scoped library artifacts)."""
    rows = (
        await session.execute(
            select(StudioMember.user_id).where(StudioMember.studio_id == studio_id)
        )
    ).scalars().all()
    return list(rows)


class NotificationDispatchService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def insert_many(
        self,
        *,
        user_ids: Iterable[UUID],
        kind: str,
        title: str,
        body: str,
        actor_user_id: UUID | None = None,
        studio_id: UUID | None = None,
        software_id: UUID | None = None,
        project_id: UUID | None = None,
        section_id: UUID | None = None,
    ) -> int:
        uid_set = {u for u in user_ids if u != actor_user_id}
        if not uid_set:
            return 0
        k = kind[:32]
        t = title[:512]
        rows = [
            Notification(
                id=uuid.uuid4(),
                user_id=u,
                kind=k,
                title=t,
                body=body,
                studio_id=studio_id,
                software_id=software_id,
                project_id=project_id,
                section_id=section_id,
            )
            for u in uid_set
        ]
        self.db.add_all(rows)
        await self.db.flush()
        return len(rows)

    async def artifact_embedded(
        self,
        art: Artifact,
        *,
        actor_user_id: UUID | None,
    ) -> int:
        scope = art.scope_level or "project"
        recipients: list[UUID] = []
        studio: UUID | None = None
        software: UUID | None = None
        project: UUID | None = None

        if scope == "project":
            if art.project_id is None:
                return 0
            recipients = await list_project_editor_user_ids(self.db, art.project_id)
            pr = await self.db.get(Project, art.project_id)
            if pr is not None:
                sw_row = await self.db.get(Software, pr.software_id)
                studio = sw_row.studio_id if sw_row is not None else None
                software = pr.software_id
                project = pr.id
        elif scope == "software":
            if art.library_software_id is None:
                return 0
            recipients = await list_software_editor_user_ids(
                self.db, art.library_software_id
            )
            sw = await self.db.get(Software, art.library_software_id)
            if sw is not None:
                studio = sw.studio_id
                software = sw.id
        elif scope == "studio":
            if art.library_studio_id is None:
                return 0
            recipients = await list_studio_editor_user_ids(
                self.db, art.library_studio_id
            )
            studio = art.library_studio_id
        else:
            return 0

        exclude = actor_user_id if actor_user_id is not None else art.uploaded_by
        title = f"Artifact indexed: {art.name}"
        body = (
            f"The artifact “{art.name}” is ready for search (embedding complete)."
        )
        return await self.insert_many(
            user_ids=recipients,
            kind=NK.ARTIFACT_EMBEDDED,
            title=title,
            body=body,
            actor_user_id=exclude,
            studio_id=studio,
            software_id=software,
            project_id=project,
        )

    async def artifact_deleted(
        self,
        *,
        name: str,
        scope_level: str,
        project_id: UUID | None,
        library_software_id: UUID | None,
        library_studio_id: UUID | None,
        actor_user_id: UUID,
    ) -> int:
        scope = scope_level or "project"
        recipients: list[UUID] = []
        studio: UUID | None = None
        software: UUID | None = None
        project: UUID | None = None

        if scope == "project":
            if project_id is None:
                return 0
            recipients = await list_project_editor_user_ids(self.db, project_id)
            pr = await self.db.get(Project, project_id)
            if pr is not None:
                studio = await self._studio_for_project(pr.id)
                software = pr.software_id
                project = pr.id
        elif scope == "software":
            if library_software_id is None:
                return 0
            recipients = await list_software_editor_user_ids(
                self.db, library_software_id
            )
            sw = await self.db.get(Software, library_software_id)
            if sw is not None:
                studio = sw.studio_id
                software = sw.id
        elif scope == "studio":
            if library_studio_id is None:
                return 0
            recipients = await list_studio_editor_user_ids(self.db, library_studio_id)
            studio = library_studio_id
        else:
            return 0

        title = f"Artifact removed: {name}"
        body = f"The artifact “{name}” was deleted."
        return await self.insert_many(
            user_ids=recipients,
            kind=NK.ARTIFACT_DELETED,
            title=title,
            body=body,
            actor_user_id=actor_user_id,
            studio_id=studio,
            software_id=software,
            project_id=project,
        )

    async def section_updated_by_other(
        self,
        *,
        project_id: UUID,
        section_id: UUID,
        section_title: str,
        actor_user_id: UUID,
    ) -> int:
        recipients = await list_project_editor_user_ids(self.db, project_id)
        pr = await self.db.get(Project, project_id)
        if pr is None:
            return 0
        studio = await self._studio_for_project(pr.id)
        title = f"Section updated: {section_title}"
        body = "Another editor changed spec content in this section."
        return await self.insert_many(
            user_ids=recipients,
            kind=NK.SECTION_UPDATED,
            title=title,
            body=body,
            actor_user_id=actor_user_id,
            studio_id=studio,
            software_id=pr.software_id,
            project_id=project_id,
            section_id=section_id,
        )

    async def publish_commit(
        self,
        *,
        project_id: UUID,
        software_id: UUID,
        studio_id: UUID,
        project_name: str,
        commit_url: str,
        actor_user_id: UUID,
    ) -> int:
        recipients = await list_project_editor_user_ids(self.db, project_id)
        title = f"Published: {project_name}"
        body = f"Specification was pushed to GitLab.\n{commit_url}"
        return await self.insert_many(
            user_ids=recipients,
            kind=NK.PUBLISH_COMMIT,
            title=title,
            body=body,
            actor_user_id=actor_user_id,
            studio_id=studio_id,
            software_id=software_id,
            project_id=project_id,
        )

    async def work_order_status_changed(
        self,
        *,
        project_id: UUID,
        software_id: UUID,
        studio_id: UUID,
        work_order_title: str,
        old_status: str,
        new_status: str,
        notify_user_ids: list[UUID],
        actor_user_id: UUID | None,
    ) -> int:
        title = f"Work order status: {work_order_title}"
        body = f"Status changed from “{old_status}” to “{new_status}”."
        return await self.insert_many(
            user_ids=notify_user_ids,
            kind=NK.WORK_ORDER_STATUS,
            title=title[:512],
            body=body,
            actor_user_id=actor_user_id,
            studio_id=studio_id,
            software_id=software_id,
            project_id=project_id,
        )

    async def _studio_for_project(self, project_id: UUID) -> UUID | None:
        pr = await self.db.get(Project, project_id)
        if pr is None:
            return None
        sw = await self.db.get(Software, pr.software_id)
        return sw.studio_id if sw is not None else None
