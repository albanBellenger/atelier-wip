"""Section business logic."""

import re
import unicodedata
import uuid
from typing import Any

from pycrdt import Doc, Text
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ApiError
from app.models import Issue, Project, Section, Software, WorkOrder, WorkOrderSection
from app.schemas.section import SectionCreate, SectionResponse, SectionUpdate
from app.schemas.token_context import TokenContext
from app.services.llm_service import LLMService
from app.services.rag_service import RAGService
from app.services.section_status import SectionStatusLiteral, rollup_section_status

# Shared Y.Text map key — must match frontend `YDOC_TEXT_FIELD` and collab persistence.
SECTION_YJS_TEXT_FIELD = "codemirror"

SECTION_IMPROVE_SCHEMA: dict[str, Any] = {
    "name": "section_improve",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "improved_markdown": {"type": "string"},
        },
        "required": ["improved_markdown"],
    },
}


def snapshot_from_yjs_update_bytes(blob: bytes | None) -> str | None:
    """Decode plaintext from Yjs update bytes; None if blob missing or invalid."""
    if not blob:
        return None
    try:
        doc = Doc()
        doc.apply_update(bytes(blob))
        if SECTION_YJS_TEXT_FIELD not in doc:
            return ""
        # After apply_update(), ``doc[key]`` can be None; ``get(..., type=Text)`` resolves the Text.
        shared = doc.get(SECTION_YJS_TEXT_FIELD, type=Text)
        return str(shared)
    except ValueError:
        return None


def effective_section_plaintext(
    content: str | None, yjs_state: bytes | None
) -> str:
    """Plaintext for API responses: DB column, or Yjs when empty / legacy ``\"None\"``."""
    snap = content or ""
    if snap == "None":
        snap = ""
    if snap.strip() != "":
        return snap
    extracted = snapshot_from_yjs_update_bytes(yjs_state)
    if extracted is not None:
        return extracted
    return snap


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

    def _to_response(self, s: Section, *, status: SectionStatusLiteral) -> SectionResponse:
        snap = effective_section_plaintext(s.content, s.yjs_state)
        return SectionResponse(
            id=s.id,
            project_id=s.project_id,
            title=s.title,
            slug=s.slug,
            order=s.order,
            content=snap,
            status=status,
            created_at=s.created_at,
            updated_at=s.updated_at,
        )

    async def batch_section_statuses(
        self, project_id: uuid.UUID, sections: list[Section]
    ) -> dict[uuid.UUID, SectionStatusLiteral]:
        """Open issues + stale work orders for these sections (batched, no per-section queries)."""
        if not sections:
            return {}
        ids = [s.id for s in sections]
        id_set = frozenset(ids)

        iss_rows = (
            await self.db.execute(
                select(Issue).where(
                    Issue.project_id == project_id,
                    Issue.status == "open",
                    or_(
                        Issue.section_a_id.in_(ids),
                        Issue.section_b_id.in_(ids),
                    ),
                )
            )
        ).scalars().all()

        pair_by: dict[uuid.UUID, bool] = {i: False for i in ids}
        gap_by: dict[uuid.UUID, bool] = {i: False for i in ids}
        for iss in iss_rows:
            if iss.section_b_id is not None:
                if iss.section_a_id and iss.section_a_id in id_set:
                    pair_by[iss.section_a_id] = True
                if iss.section_b_id in id_set:
                    pair_by[iss.section_b_id] = True
            else:
                if iss.section_a_id and iss.section_a_id in id_set:
                    gap_by[iss.section_a_id] = True

        stale_ids = (
            await self.db.execute(
                select(WorkOrderSection.section_id)
                .join(WorkOrder, WorkOrderSection.work_order_id == WorkOrder.id)
                .where(
                    WorkOrder.project_id == project_id,
                    WorkOrderSection.section_id.in_(ids),
                    WorkOrder.is_stale.is_(True),
                )
                .distinct()
            )
        ).scalars().all()
        stale_by = {sid: True for sid in stale_ids}

        out: dict[uuid.UUID, SectionStatusLiteral] = {}
        for s in sections:
            snap = effective_section_plaintext(s.content, s.yjs_state)
            out[s.id] = rollup_section_status(
                effective_plaintext=snap,
                has_open_pair_conflict=pair_by.get(s.id, False),
                has_open_section_gap=gap_by.get(s.id, False),
                has_stale_linked_work_order=stale_by.get(s.id, False),
            )
        return out

    async def compute_status(self, section_id: uuid.UUID) -> SectionStatusLiteral:
        s = await self.db.get(Section, section_id)
        if s is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Section not found",
            )
        m = await self.batch_section_statuses(s.project_id, [s])
        return m[section_id]

    async def list_sections(self, project_id: uuid.UUID) -> list[SectionResponse]:
        q = (
            select(Section)
            .where(Section.project_id == project_id)
            .order_by(Section.order)
        )
        rows = list((await self.db.execute(q)).scalars().all())
        status_map = await self.batch_section_statuses(project_id, rows)
        return [self._to_response(s, status=status_map[s.id]) for s in rows]

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
        st = await self.batch_section_statuses(project_id, [sec])
        return self._to_response(sec, status=st[sec.id])

    async def get_section(self, project_id: uuid.UUID, section_id: uuid.UUID) -> SectionResponse:
        s = await self.db.get(Section, section_id)
        if s is None or s.project_id != project_id:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Section not found",
            )
        st = await self.batch_section_statuses(project_id, [s])
        return self._to_response(s, status=st[s.id])

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
            from app.services.drift_pipeline import schedule_drift_check
            from app.services.embedding_pipeline import schedule_section_embedding

            schedule_section_embedding(section_id)
            schedule_drift_check(section_id)
        st = await self.batch_section_statuses(project_id, [s])
        return self._to_response(s, status=st[s.id])

    async def delete_section(
        self,
        project_id: uuid.UUID,
        section_id: uuid.UUID,
        *,
        actor_is_studio_admin: bool,
    ) -> None:
        if not actor_is_studio_admin:
            raise ApiError(
                status_code=403,
                code="FORBIDDEN",
                message="Studio admin access required",
            )
        s = await self.db.get(Section, section_id)
        if s is None or s.project_id != project_id:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Section not found",
            )
        await self.db.delete(s)
        await self.db.commit()

    async def improve_section_markdown(
        self,
        project_id: uuid.UUID,
        section_id: uuid.UUID,
        *,
        instruction: str | None,
        current_section_plaintext: str | None,
        user_id: uuid.UUID,
    ) -> str:
        """Return LLM-revised markdown; does not persist to the section."""
        s = await self.db.get(Section, section_id)
        if s is None or s.project_id != project_id:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Section not found",
            )
        pr = await self.db.get(Project, project_id)
        if pr is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Project not found",
            )
        sw = await self.db.get(Software, pr.software_id)
        if sw is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Software not found",
            )
        body_text = (
            current_section_plaintext.strip()
            if current_section_plaintext is not None
            else effective_section_plaintext(s.content, s.yjs_state)
        )
        ctx = TokenContext(
            studio_id=sw.studio_id,
            software_id=sw.id,
            project_id=project_id,
            user_id=user_id,
        )
        rag = await RAGService(self.db).build_context(
            query=(instruction or "Improve this specification section.").strip()
            + f"\n{s.title}",
            project_id=project_id,
            current_section_id=section_id,
            current_section_plaintext_override=current_section_plaintext,
        )
        llm = LLMService(self.db)
        user_block = (
            f"Section title: {s.title}\n\nCurrent markdown:\n{body_text}\n"
        )
        if instruction and instruction.strip():
            user_block += f"\nAuthor instruction:\n{instruction.strip()}\n"
        raw = await llm.chat_structured(
            system_prompt=(
                "You revise specification markdown. Preserve intent and structure where "
                "reasonable; remove ambiguity; do not invent requirements absent from the "
                "input or context. Return JSON only with improved_markdown.\n\n"
                + rag.text
            ),
            user_prompt=user_block,
            json_schema=SECTION_IMPROVE_SCHEMA,
            context=ctx,
            call_type="section_improve",
        )
        if not isinstance(raw, dict):
            raise ApiError(
                status_code=502,
                code="LLM_BAD_OUTPUT",
                message="Improve response was not structured JSON.",
            )
        out = str(raw.get("improved_markdown") or "").strip()
        if not out:
            raise ApiError(
                status_code=502,
                code="LLM_BAD_OUTPUT",
                message="Improve response missing improved_markdown.",
            )
        return out
