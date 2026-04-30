"""Section business logic."""

import re
import unicodedata
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ApiError
from app.models import Section
from app.schemas.section import SectionCreate, SectionResponse, SectionUpdate


def slugify_title(title: str) -> str:
    s = unicodedata.normalize("NFKD", title)
    s = s.encode("ascii", "ignore").decode("ascii")
    s = s.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = s.strip("-")
    return s or "section"


class SectionService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def _next_unique_slug(
        self,
        project_id: uuid.UUID,
        base_slug: str,
        *,
        exclude_section_id: uuid.UUID | None = None,
    ) -> str:
        candidate = base_slug
        n = 2
        while True:
            q = select(Section.id).where(
                Section.project_id == project_id,
                Section.slug == candidate,
            )
            if exclude_section_id is not None:
                q = q.where(Section.id != exclude_section_id)
            r = await self.db.execute(q)
            if r.scalar_one_or_none() is None:
                return candidate
            candidate = f"{base_slug}-{n}"
            n += 1

    async def _next_order(self, project_id: uuid.UUID) -> int:
        r = await self.db.execute(
            select(func.max(Section.order)).where(Section.project_id == project_id)
        )
        m = r.scalar_one_or_none()
        return (m + 1) if m is not None else 0

    def _to_response(self, s: Section) -> SectionResponse:
        return SectionResponse(
            id=s.id,
            project_id=s.project_id,
            title=s.title,
            slug=s.slug,
            order=s.order,
            content=s.content or "",
            created_at=s.created_at,
            updated_at=s.updated_at,
        )

    async def list_sections(self, project_id: uuid.UUID) -> list[SectionResponse]:
        q = (
            select(Section)
            .where(Section.project_id == project_id)
            .order_by(Section.order)
        )
        rows = (await self.db.execute(q)).scalars().all()
        return [self._to_response(s) for s in rows]

    async def reorder_sections(
        self,
        project_id: uuid.UUID,
        section_ids: list[uuid.UUID],
    ) -> list[SectionResponse]:
        q = select(Section).where(Section.project_id == project_id)
        rows = (await self.db.execute(q)).scalars().all()
        existing: dict[uuid.UUID, Section] = {s.id: s for s in rows}
        if len(section_ids) != len(existing):
            raise ApiError(
                status_code=400,
                code="BAD_REQUEST",
                message="section_ids must list every section in the project exactly once",
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
                    message="Unknown section id for this project",
                )
        for i, sid in enumerate(section_ids):
            existing[sid].order = i
        await self.db.commit()
        return await self.list_sections(project_id)

    async def create_section(
        self, project_id: uuid.UUID, body: SectionCreate
    ) -> SectionResponse:
        title = body.title.strip()
        if body.slug is not None and body.slug.strip():
            base = body.slug.strip().lower()[:256]
        else:
            base = slugify_title(title)[:256]
        slug = await self._next_unique_slug(project_id, base)
        order = await self._next_order(project_id)
        sec = Section(
            id=uuid.uuid4(),
            project_id=project_id,
            title=title,
            slug=slug,
            order=order,
            content="",
        )
        self.db.add(sec)
        await self.db.commit()
        await self.db.refresh(sec)
        return self._to_response(sec)

    async def get_section(self, project_id: uuid.UUID, section_id: uuid.UUID) -> SectionResponse:
        s = await self.db.get(Section, section_id)
        if s is None or s.project_id != project_id:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Section not found",
            )
        return self._to_response(s)

    async def update_section(
        self,
        project_id: uuid.UUID,
        section_id: uuid.UUID,
        body: SectionUpdate,
        *,
        is_studio_admin: bool,
    ) -> SectionResponse:
        s = await self.db.get(Section, section_id)
        if s is None or s.project_id != project_id:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Section not found",
            )
        old_content = s.content or ""
        old_title = s.title
        data = body.model_dump(exclude_unset=True)
        structure_keys = ("title", "slug", "order")
        if any(k in data for k in structure_keys) and not is_studio_admin:
            raise ApiError(
                status_code=403,
                code="FORBIDDEN",
                message="Studio admin access required to modify section title, slug, or order",
            )
        if "title" in data and data["title"] is not None:
            s.title = str(data["title"]).strip()
        if "slug" in data and data["slug"] is not None:
            raw = str(data["slug"]).strip().lower()
            if raw and raw != s.slug:
                unique = await self._next_unique_slug(
                    project_id, raw[:256], exclude_section_id=section_id
                )
                s.slug = unique
        if "order" in data and data["order"] is not None:
            s.order = int(data["order"])
        if "content" in data:
            s.content = data["content"] if data["content"] is not None else ""
        if (
            "title" in data
            and data["title"] is not None
            and s.title != old_title
            and "slug" not in data
        ):
            base = slugify_title(s.title)[:256]
            s.slug = await self._next_unique_slug(
                project_id, base, exclude_section_id=section_id
            )
        await self.db.commit()
        await self.db.refresh(s)
        if "content" in data and (s.content or "") != old_content:
            from app.services.embedding_pipeline import schedule_section_embedding

            schedule_section_embedding(section_id)
        return self._to_response(s)

    async def delete_section(self, project_id: uuid.UUID, section_id: uuid.UUID) -> None:
        s = await self.db.get(Section, section_id)
        if s is None or s.project_id != project_id:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Section not found",
            )
        await self.db.delete(s)
        await self.db.commit()
