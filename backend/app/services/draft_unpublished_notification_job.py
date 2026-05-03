"""Periodic reminders for spec sections not pushed to GitLab for 5+ days."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import notification_kinds as NK
from app.models import Project, Section, Software
from app.services.notification_dispatch_service import (
    NotificationDispatchService,
    list_project_editor_user_ids,
)


STALE_DAYS = 5
DEDUPE_DAYS = 7


async def run_draft_unpublished_notifications(session: AsyncSession) -> int:
    """Notify project editors about sections whose edits are not reflected in GitLab export."""
    now = datetime.now(timezone.utc)
    stale_before = now - timedelta(days=STALE_DAYS)
    dedupe_before = now - timedelta(days=DEDUPE_DAYS)

    stmt = (
        select(Section, Project)
        .join(Project, Section.project_id == Project.id)
        .where(
            Section.updated_at <= stale_before,
            or_(
                Project.last_published_at.is_(None),
                Section.updated_at > Project.last_published_at,
            ),
            or_(
                Section.last_stale_notified_at.is_(None),
                Section.last_stale_notified_at <= dedupe_before,
            ),
        )
    )
    rows = list((await session.execute(stmt)).all())
    dispatch = NotificationDispatchService(session)
    created = 0
    for sec, pr in rows:
        recipients = await list_project_editor_user_ids(session, pr.id)
        sw = await session.get(Software, pr.software_id)
        studio_id = sw.studio_id if sw is not None else None
        title = f"Unpublished edits: {sec.title}"
        body = (
            "This section was updated at least "
            f"{STALE_DAYS} days ago but has not been published to GitLab since."
        )
        n = await dispatch.insert_many(
            user_ids=recipients,
            kind=NK.DRAFT_UNPUBLISHED,
            title=title[:512],
            body=body,
            actor_user_id=None,
            studio_id=studio_id,
            software_id=pr.software_id,
            project_id=pr.id,
            section_id=sec.id,
        )
        sec.last_stale_notified_at = now
        created += n
    await session.flush()
    return created
