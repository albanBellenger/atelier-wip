"""Software-level Markdown docs backed by ``Section`` rows (``software_id`` set)."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ApiError
from app.models import Section, Software
from app.schemas.section import SectionCreate, SectionResponse, SectionUpdate
from app.services.section_service import (
    effective_section_plaintext,
    slugify_title,
    yjs_update_from_plaintext,
)
from app.services.section_status import SectionStatusLiteral, rollup_section_status
from app.services.software_activity_service import SoftwareActivityService


def _to_docs_response(s: Section) -> SectionResponse:
    snap = effective_section_plaintext(s.content, s.yjs_state)
    status: SectionStatusLiteral = rollup_section_status(
        effective_plaintext=snap,
        has_open_pair_conflict=False,
        has_open_section_gap=False,
        has_stale_linked_work_order=False,
    )
    return SectionResponse(
        id=s.id,
        project_id=None,
        software_id=s.software_id,
        title=s.title,
        slug=s.slug,
        order=s.order,
        content=snap,
        status=status,
        open_issue_count=0,
        outline_health=None,
        created_at=s.created_at,
        updated_at=s.updated_at,
    )


class SoftwareDocsSectionService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def _next_unique_slug(
        self,
        software_id: uuid.UUID,
        base_slug: str,
        *,
        exclude_section_id: uuid.UUID | None = None,
    ) -> str:
        candidate = base_slug
        n = 2
        while True:
            q = select(Section.id).where(
                Section.software_id == software_id,
                Section.project_id.is_(None),
                Section.slug == candidate,
            )
            if exclude_section_id is not None:
                q = q.where(Section.id != exclude_section_id)
            r = await self.db.execute(q)
            if r.scalar_one_or_none() is None:
                return candidate
            candidate = f"{base_slug}-{n}"
            n += 1

    async def _next_order(self, software_id: uuid.UUID) -> int:
        r = await self.db.execute(
            select(func.max(Section.order)).where(
                Section.software_id == software_id,
                Section.project_id.is_(None),
            )
        )
        m = r.scalar_one_or_none()
        return (m + 1) if m is not None else 0

    async def _ensure_software(self, software_id: uuid.UUID) -> Software:
        sw = await self.db.get(Software, software_id)
        if sw is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Software not found.",
            )
        return sw

    async def list_sections(self, software_id: uuid.UUID) -> list[SectionResponse]:
        await self._ensure_software(software_id)
        q = (
            select(Section)
            .where(
                Section.software_id == software_id,
                Section.project_id.is_(None),
            )
            .order_by(Section.order)
        )
        rows = list((await self.db.execute(q)).scalars().all())
        return [_to_docs_response(s) for s in rows]

    async def create_section(
        self,
        software_id: uuid.UUID,
        body: SectionCreate,
        *,
        actor_user_id: uuid.UUID,
        studio_id: uuid.UUID,
    ) -> SectionResponse:
        await self._ensure_software(software_id)
        title = body.title.strip()
        if body.slug is not None and body.slug.strip():
            base = body.slug.strip().lower()[:256]
        else:
            base = slugify_title(title)[:256]
        slug = await self._next_unique_slug(software_id, base)
        order = await self._next_order(software_id)
        initial = (body.content or "").strip() if body.content is not None else ""
        yjs_blob = yjs_update_from_plaintext(initial)
        sec = Section(
            id=uuid.uuid4(),
            project_id=None,
            software_id=software_id,
            title=title,
            slug=slug,
            order=order,
            content=initial,
            yjs_state=yjs_blob,
        )
        if initial:
            sec.last_edited_by_id = actor_user_id
        self.db.add(sec)
        await self.db.commit()
        await self.db.refresh(sec)
        if initial:
            from app.services.drift_pipeline import schedule_drift_check
            from app.services.embedding_pipeline import schedule_section_embedding

            schedule_section_embedding(sec.id)
            schedule_drift_check(sec.id)
        await SoftwareActivityService(self.db).record(
            software_id=software_id,
            studio_id=studio_id,
            actor_user_id=actor_user_id,
            verb="software_doc_section_created",
            summary=f"Created software doc «{sec.title}»",
            entity_type="software_doc_section",
            entity_id=sec.id,
        )
        await self.db.commit()
        return _to_docs_response(sec)

    async def get_section(
        self, software_id: uuid.UUID, section_id: uuid.UUID
    ) -> SectionResponse:
        s = await self.db.get(Section, section_id)
        if (
            s is None
            or s.software_id != software_id
            or s.project_id is not None
        ):
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Section not found.",
            )
        return _to_docs_response(s)

    async def update_section(
        self,
        software_id: uuid.UUID,
        section_id: uuid.UUID,
        body: SectionUpdate,
        *,
        is_studio_admin: bool,
        actor_user_id: uuid.UUID,
        studio_id: uuid.UUID,
    ) -> SectionResponse:
        s = await self.db.get(Section, section_id)
        if (
            s is None
            or s.software_id != software_id
            or s.project_id is not None
        ):
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Section not found.",
            )
        old_content = s.content or ""
        old_title = s.title
        data = body.model_dump(exclude_unset=True)
        structure_keys = ("title", "slug", "order")
        if any(k in data for k in structure_keys) and not is_studio_admin:
            raise ApiError(
                status_code=403,
                code="FORBIDDEN",
                message="Studio Owner access required to modify doc title, slug, or order",
            )
        if "title" in data and data["title"] is not None:
            s.title = str(data["title"]).strip()
        if "slug" in data and data["slug"] is not None:
            raw = str(data["slug"]).strip().lower()
            if raw and raw != s.slug:
                unique = await self._next_unique_slug(
                    software_id, raw[:256], exclude_section_id=section_id
                )
                s.slug = unique
        if "order" in data and data["order"] is not None:
            s.order = int(data["order"])
        if "content" in data:
            new_c = data["content"] if data["content"] is not None else ""
            if new_c != old_content:
                s.last_edited_by_id = actor_user_id
            s.content = new_c
        if (
            "title" in data
            and data["title"] is not None
            and s.title != old_title
            and "slug" not in data
        ):
            base = slugify_title(s.title)[:256]
            s.slug = await self._next_unique_slug(
                software_id, base, exclude_section_id=section_id
            )
        await self.db.commit()
        await self.db.refresh(s)
        content_changed = "content" in data and (s.content or "") != old_content
        structure_changed = any(k in data for k in structure_keys)
        if content_changed:
            from app.services.drift_pipeline import schedule_drift_check
            from app.services.embedding_pipeline import schedule_section_embedding

            schedule_section_embedding(section_id)
            schedule_drift_check(section_id)
        if content_changed or structure_changed:
            await SoftwareActivityService(self.db).record(
                software_id=software_id,
                studio_id=studio_id,
                actor_user_id=actor_user_id,
                verb="software_doc_section_updated",
                summary=f"Updated software doc «{s.title}»",
                entity_type="software_doc_section",
                entity_id=s.id,
            )
            await self.db.commit()
        return _to_docs_response(s)

    async def reorder_sections(
        self,
        software_id: uuid.UUID,
        section_ids: list[uuid.UUID],
        *,
        actor_user_id: uuid.UUID,
        studio_id: uuid.UUID,
    ) -> list[SectionResponse]:
        await self._ensure_software(software_id)
        q = select(Section).where(
            Section.software_id == software_id,
            Section.project_id.is_(None),
        )
        rows = (await self.db.execute(q)).scalars().all()
        existing: dict[uuid.UUID, Section] = {s.id: s for s in rows}
        if len(section_ids) != len(existing):
            raise ApiError(
                status_code=400,
                code="BAD_REQUEST",
                message="section_ids must list every software doc section exactly once",
            )
        seen: set[uuid.UUID] = set()
        for sid in section_ids:
            if sid in seen:
                raise ApiError(
                    status_code=400,
                    code="BAD_REQUEST",
                    message="section_ids must not contain duplicates",
                )
            seen.add(sid)
            if sid not in existing:
                raise ApiError(
                    status_code=400,
                    code="BAD_REQUEST",
                    message="Unknown section id for this software",
                )
        for i, sid in enumerate(section_ids):
            existing[sid].order = i
        await self.db.commit()
        await SoftwareActivityService(self.db).record(
            software_id=software_id,
            studio_id=studio_id,
            actor_user_id=actor_user_id,
            verb="software_doc_sections_reordered",
            summary="Reordered software documentation outline",
            entity_type="software",
            entity_id=software_id,
        )
        await self.db.commit()
        return await self.list_sections(software_id)

    async def delete_section(
        self,
        software_id: uuid.UUID,
        section_id: uuid.UUID,
        *,
        actor_user_id: uuid.UUID,
        studio_id: uuid.UUID,
    ) -> None:
        s = await self.db.get(Section, section_id)
        if (
            s is None
            or s.software_id != software_id
            or s.project_id is not None
        ):
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Section not found.",
            )
        title = s.title
        await self.db.delete(s)
        await self.db.commit()
        await SoftwareActivityService(self.db).record(
            software_id=software_id,
            studio_id=studio_id,
            actor_user_id=actor_user_id,
            verb="software_doc_section_deleted",
            summary=f"Deleted software doc «{title}»",
            entity_type="software_doc_section",
            entity_id=section_id,
        )
        await self.db.commit()
