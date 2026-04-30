"""Work order CRUD, filters, generation, notes, dismiss stale."""

from __future__ import annotations

import structlog
import uuid
from datetime import datetime, timezone
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.exceptions import ApiError
from app.models import (
    GraphEdge,
    Project,
    Section,
    Software,
    User,
    WorkOrder,
    WorkOrderNote,
)
from app.models.work_order import WorkOrderSection
from app.schemas.token_context import TokenContext
from app.schemas.work_order import (
    GenerateWorkOrdersBody,
    WorkOrderCreate,
    WorkOrderDetailResponse,
    WorkOrderNoteCreate,
    WorkOrderNoteResponse,
    WorkOrderResponse,
    WorkOrderUpdate,
)
from app.services.graph_service import GraphService
from app.services.llm_service import WORK_ORDER_BATCH_JSON_SCHEMA, LLMService

log = structlog.get_logger("atelier.work_order")

VALID_STATUSES = frozenset(
    {"backlog", "in_progress", "in_review", "done", "archived"}
)


class WorkOrderService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def _assignee_names(self, ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
        if not ids:
            return {}
        r = await self.db.execute(select(User.id, User.display_name).where(User.id.in_(ids)))
        return {row[0]: row[1] for row in r.all()}

    def _to_response(
        self,
        wo: WorkOrder,
        *,
        section_ids: list[uuid.UUID],
        assignee_name: str | None,
    ) -> WorkOrderResponse:
        return WorkOrderResponse(
            id=wo.id,
            project_id=wo.project_id,
            title=wo.title,
            description=wo.description,
            implementation_guide=wo.implementation_guide,
            acceptance_criteria=wo.acceptance_criteria,
            status=wo.status,
            phase=wo.phase,
            phase_order=wo.phase_order,
            assignee_id=wo.assignee_id,
            assignee_display_name=assignee_name,
            is_stale=wo.is_stale,
            stale_reason=wo.stale_reason,
            created_by=wo.created_by,
            created_at=wo.created_at,
            updated_at=wo.updated_at,
            section_ids=section_ids,
        )

    async def list_work_orders(
        self,
        project_id: uuid.UUID,
        *,
        status: str | None = None,
        assignee_id: uuid.UUID | None = None,
        phase: str | None = None,
        is_stale: bool | None = None,
        section_id: uuid.UUID | None = None,
    ) -> list[WorkOrderResponse]:
        q = select(WorkOrder).where(WorkOrder.project_id == project_id)
        if status is not None:
            q = q.where(WorkOrder.status == status)
        if assignee_id is not None:
            q = q.where(WorkOrder.assignee_id == assignee_id)
        if phase is not None:
            q = q.where(WorkOrder.phase == phase)
        if is_stale is not None:
            q = q.where(WorkOrder.is_stale == is_stale)
        if section_id is not None:
            q = (
                q.join(
                    WorkOrderSection,
                    WorkOrderSection.work_order_id == WorkOrder.id,
                ).where(WorkOrderSection.section_id == section_id)
            )
        q = q.order_by(WorkOrder.updated_at.desc())
        rows = (await self.db.execute(q)).scalars().unique().all()
        if not rows:
            return []
        woids = [w.id for w in rows]
        sec_map = await self._section_ids_for_work_orders(woids)
        aid = {w.assignee_id for w in rows if w.assignee_id}
        names = await self._assignee_names(aid)
        return [
            self._to_response(
                w,
                section_ids=sec_map.get(w.id, []),
                assignee_name=names.get(w.assignee_id) if w.assignee_id else None,
            )
            for w in rows
        ]

    async def _section_ids_for_work_orders(
        self, work_order_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, list[uuid.UUID]]:
        if not work_order_ids:
            return {}
        r = await self.db.execute(
            select(WorkOrderSection.work_order_id, WorkOrderSection.section_id).where(
                WorkOrderSection.work_order_id.in_(work_order_ids)
            )
        )
        out: dict[uuid.UUID, list[uuid.UUID]] = {}
        for wid, sid in r.all():
            out.setdefault(wid, []).append(sid)
        return out

    async def get_work_order(
        self, project_id: uuid.UUID, work_order_id: uuid.UUID, *, detail: bool
    ) -> WorkOrderResponse | WorkOrderDetailResponse:
        q = select(WorkOrder).where(
            WorkOrder.id == work_order_id,
            WorkOrder.project_id == project_id,
        )
        if detail:
            q = q.options(selectinload(WorkOrder.notes))
        wo = (await self.db.execute(q)).scalar_one_or_none()
        if wo is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Work order not found.",
            )
        sec_map = await self._section_ids_for_work_orders([wo.id])
        names = await self._assignee_names(
            {wo.assignee_id} if wo.assignee_id else set()
        )
        base = self._to_response(
            wo,
            section_ids=sec_map.get(wo.id, []),
            assignee_name=names.get(wo.assignee_id) if wo.assignee_id else None,
        )
        if not detail:
            return base
        notes = [
            WorkOrderNoteResponse.model_validate(n)
            for n in sorted(wo.notes, key=lambda x: x.created_at)
        ]
        return WorkOrderDetailResponse(**base.model_dump(), notes=notes)

    async def create(
        self,
        project_id: uuid.UUID,
        body: WorkOrderCreate,
        *,
        created_by: uuid.UUID,
    ) -> WorkOrderResponse:
        if body.status not in VALID_STATUSES:
            raise ApiError(
                status_code=422,
                code="INVALID_STATUS",
                message=f"status must be one of: {', '.join(sorted(VALID_STATUSES))}",
            )
        wo = WorkOrder(
            id=uuid.uuid4(),
            project_id=project_id,
            title=body.title.strip(),
            description=body.description.strip(),
            implementation_guide=body.implementation_guide.strip()
            if body.implementation_guide
            else None,
            acceptance_criteria=body.acceptance_criteria.strip()
            if body.acceptance_criteria
            else None,
            status=body.status,
            phase=body.phase.strip() if body.phase else None,
            phase_order=body.phase_order,
            assignee_id=body.assignee_id,
            created_by=created_by,
        )
        self.db.add(wo)
        await self.db.flush()
        await self._set_sections(wo.id, project_id, body.section_ids)
        await self.db.flush()
        await self.db.refresh(wo)
        sec_map = await self._section_ids_for_work_orders([wo.id])
        names = await self._assignee_names(
            {wo.assignee_id} if wo.assignee_id else set()
        )
        return self._to_response(
            wo,
            section_ids=sec_map.get(wo.id, []),
            assignee_name=names.get(wo.assignee_id) if wo.assignee_id else None,
        )

    async def _set_sections(
        self,
        work_order_id: uuid.UUID,
        project_id: uuid.UUID,
        section_ids: list[uuid.UUID],
    ) -> None:
        await self.db.execute(
            delete(WorkOrderSection).where(
                WorkOrderSection.work_order_id == work_order_id
            )
        )
        for sid in section_ids:
            sec = await self.db.get(Section, sid)
            if sec is None or sec.project_id != project_id:
                raise ApiError(
                    status_code=422,
                    code="INVALID_SECTION",
                    message="All section_ids must belong to this project.",
                )
            self.db.add(
                WorkOrderSection(work_order_id=work_order_id, section_id=sid)
            )

    async def update(
        self,
        project_id: uuid.UUID,
        work_order_id: uuid.UUID,
        body: WorkOrderUpdate,
    ) -> WorkOrderResponse:
        wo = await self._get_wo(project_id, work_order_id)
        data = body.model_dump(exclude_unset=True)
        if "status" in data and data["status"] is not None:
            if data["status"] not in VALID_STATUSES:
                raise ApiError(
                    status_code=422,
                    code="INVALID_STATUS",
                    message=f"status must be one of: {', '.join(sorted(VALID_STATUSES))}",
                )
        if "title" in data and data["title"] is not None:
            wo.title = str(data["title"]).strip()
        if "description" in data and data["description"] is not None:
            wo.description = str(data["description"]).strip()
        if "implementation_guide" in data:
            wo.implementation_guide = (
                str(data["implementation_guide"]).strip()
                if data["implementation_guide"]
                else None
            )
        if "acceptance_criteria" in data:
            wo.acceptance_criteria = (
                str(data["acceptance_criteria"]).strip()
                if data["acceptance_criteria"]
                else None
            )
        if "status" in data and data["status"] is not None:
            wo.status = data["status"]
        if "phase" in data:
            wo.phase = (
                str(data["phase"]).strip() if data["phase"] is not None else None
            )
        if "phase_order" in data:
            wo.phase_order = data["phase_order"]
        if "assignee_id" in data:
            wo.assignee_id = data["assignee_id"]
        if "section_ids" in data and data["section_ids"] is not None:
            await self._set_sections(wo.id, project_id, data["section_ids"])
        await self.db.flush()
        await self.db.refresh(wo)
        sec_map = await self._section_ids_for_work_orders([wo.id])
        names = await self._assignee_names(
            {wo.assignee_id} if wo.assignee_id else set()
        )
        return self._to_response(
            wo,
            section_ids=sec_map.get(wo.id, []),
            assignee_name=names.get(wo.assignee_id) if wo.assignee_id else None,
        )

    async def delete(self, project_id: uuid.UUID, work_order_id: uuid.UUID) -> None:
        wo = await self._get_wo(project_id, work_order_id)
        await self.db.delete(wo)
        await self.db.flush()

    async def _get_wo(
        self, project_id: uuid.UUID, work_order_id: uuid.UUID
    ) -> WorkOrder:
        wo = await self.db.get(WorkOrder, work_order_id)
        if wo is None or wo.project_id != project_id:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Work order not found.",
            )
        return wo

    async def add_note(
        self,
        project_id: uuid.UUID,
        work_order_id: uuid.UUID,
        body: WorkOrderNoteCreate,
        *,
        author_id: uuid.UUID,
    ) -> WorkOrderNoteResponse:
        await self._get_wo(project_id, work_order_id)
        note = WorkOrderNote(
            id=uuid.uuid4(),
            work_order_id=work_order_id,
            author_id=author_id,
            source="user",
            content=body.content.strip(),
        )
        self.db.add(note)
        await self.db.flush()
        await self.db.refresh(note)
        return WorkOrderNoteResponse.model_validate(note)

    async def dismiss_stale(
        self,
        project_id: uuid.UUID,
        work_order_id: uuid.UUID,
        *,
        user_id: uuid.UUID,
    ) -> WorkOrderResponse:
        wo = await self._get_wo(project_id, work_order_id)
        wo.is_stale = False
        wo.stale_reason = None
        wo.stale_dismissed_by = user_id
        wo.stale_dismissed_at = datetime.now(timezone.utc)
        self.db.add(
            WorkOrderNote(
                id=uuid.uuid4(),
                work_order_id=work_order_id,
                author_id=user_id,
                source="stale_dismiss",
                content="Stale flag dismissed (work order reviewed against current spec).",
            )
        )
        await self.db.flush()
        await self.db.refresh(wo)
        sec_map = await self._section_ids_for_work_orders([wo.id])
        names = await self._assignee_names(
            {wo.assignee_id} if wo.assignee_id else set()
        )
        return self._to_response(
            wo,
            section_ids=sec_map.get(wo.id, []),
            assignee_name=names.get(wo.assignee_id) if wo.assignee_id else None,
        )

    async def generate_work_orders(
        self,
        project_id: uuid.UUID,
        body: GenerateWorkOrdersBody,
        *,
        user_id: uuid.UUID,
    ) -> list[WorkOrderResponse]:
        project = await self.db.get(Project, project_id)
        if project is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Project not found.",
            )
        software = await self.db.get(Software, project.software_id)
        if software is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Software not found.",
            )
        studio_id = software.studio_id
        software_id = software.id

        sections: list[Section] = []
        for sid in body.section_ids:
            sec = await self.db.get(Section, sid)
            if sec is None or sec.project_id != project_id:
                raise ApiError(
                    status_code=422,
                    code="INVALID_SECTION",
                    message="All section_ids must belong to this project.",
                )
            sections.append(sec)

        def_block = (software.definition or "").strip() or "(No software definition.)"
        sw_name = software.name
        section_lines: list[str] = []
        for s in sections:
            section_lines.append(
                f"## {s.title} (slug: {s.slug})\n\n{s.content or ''}\n"
            )
        sections_blob = "\n\n".join(section_lines)

        system_prompt = (
            f"You are a technical project manager. Software: {sw_name}.\n\n"
            f"Software definition (context):\n{def_block}\n"
        )
        user_prompt = (
            "Given the following spec sections, decompose the work into discrete, "
            "implementable Work Orders. Each Work Order must be independently executable "
            "by a single developer or coding agent.\n\n"
            "For each Work Order output JSON objects with:\n"
            "- title (short, action-oriented)\n"
            "- description (what needs to be built)\n"
            "- implementation_guide (how to approach it)\n"
            "- acceptance_criteria (verifiable outcomes)\n"
            "- linked_section_slugs (array of section slugs this derives from; "
            "must be chosen from the sections provided below)\n\n"
            "Sections:\n"
            f"{sections_blob}"
        )

        llm = LLMService(self.db)
        ctx = TokenContext(
            studio_id=studio_id,
            software_id=software_id,
            project_id=project_id,
            user_id=user_id,
        )
        parsed = await llm.chat_structured(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            json_schema=WORK_ORDER_BATCH_JSON_SCHEMA,
            context=ctx,
            call_type="work_order_gen",
        )
        items = parsed.get("items")
        if not isinstance(items, list):
            raise ApiError(
                status_code=502,
                code="LLM_INVALID_SHAPE",
                message="LLM JSON must contain an 'items' array.",
            )

        slug_to_section = {s.slug: s for s in sections}
        created: list[WorkOrder] = []
        for item in items:
            title = str(item.get("title") or "").strip()
            desc = str(item.get("description") or "").strip()
            if not title or not desc:
                continue
            ig = item.get("implementation_guide")
            ac = item.get("acceptance_criteria")
            slugs = item.get("linked_section_slugs") or []
            if not isinstance(slugs, list):
                slugs = []
            wo = WorkOrder(
                id=uuid.uuid4(),
                project_id=project_id,
                title=title[:512],
                description=desc,
                implementation_guide=str(ig).strip() if ig else None,
                acceptance_criteria=str(ac).strip() if ac else None,
                status="backlog",
                phase=None,
                phase_order=None,
                created_by=user_id,
            )
            self.db.add(wo)
            await self.db.flush()
            linked: set[uuid.UUID] = set()
            for slug in slugs:
                if not isinstance(slug, str):
                    continue
                sec = slug_to_section.get(slug.strip())
                if sec is None:
                    log.warning(
                        "llm_work_order_unknown_section_slug",
                        project_id=str(project_id),
                        slug=slug,
                    )
                    continue
                if sec.id in linked:
                    continue
                linked.add(sec.id)
                self.db.add(
                    WorkOrderSection(work_order_id=wo.id, section_id=sec.id)
                )
                await GraphService(self.db).add_edge(
                    project_id=project_id,
                    source_type="section",
                    source_id=sec.id,
                    target_type="work_order",
                    target_id=wo.id,
                    edge_type="generates",
                )
            await self.db.flush()
            created.append(wo)

        woids = [w.id for w in created]
        sec_map = await self._section_ids_for_work_orders(woids)
        aid = {w.assignee_id for w in created if w.assignee_id}
        names = await self._assignee_names(aid)
        return [
            self._to_response(
                w,
                section_ids=sec_map.get(w.id, []),
                assignee_name=names.get(w.assignee_id) if w.assignee_id else None,
            )
            for w in created
        ]

    async def add_work_order_dependency(
        self,
        project_id: uuid.UUID,
        dependent_id: uuid.UUID,
        prerequisite_id: uuid.UUID,
    ) -> None:
        """Prerequisite work order must be satisfied before dependent (edge: prereq -> dependent)."""
        if prerequisite_id == dependent_id:
            raise ApiError(
                status_code=400,
                code="BAD_REQUEST",
                message="A work order cannot depend on itself.",
            )
        await self._get_wo(project_id, prerequisite_id)
        await self._get_wo(project_id, dependent_id)
        await GraphService(self.db).add_edge(
            project_id=project_id,
            source_type="work_order",
            source_id=prerequisite_id,
            target_type="work_order",
            target_id=dependent_id,
            edge_type="depends_on",
        )
        await self.db.flush()

    async def remove_work_order_dependency(
        self,
        project_id: uuid.UUID,
        dependent_id: uuid.UUID,
        prerequisite_id: uuid.UUID,
    ) -> None:
        await self._get_wo(project_id, dependent_id)
        await self._get_wo(project_id, prerequisite_id)
        r = await self.db.execute(
            select(GraphEdge).where(
                GraphEdge.project_id == project_id,
                GraphEdge.source_type == "work_order",
                GraphEdge.source_id == prerequisite_id,
                GraphEdge.target_type == "work_order",
                GraphEdge.target_id == dependent_id,
                GraphEdge.edge_type == "depends_on",
            )
        )
        row = r.scalar_one_or_none()
        if row is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Dependency edge not found.",
            )
        await self.db.delete(row)
        await self.db.flush()
