"""Work order CRUD, filters, generation, notes, dismiss stale."""

from __future__ import annotations

import structlog
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

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
from app.schemas.token_usage_scope import TokenUsageScope
from app.schemas.work_order import (
    GenerateWorkOrdersBody,
    WorkOrderCreate,
    WorkOrderDedupeAnalyzeResponse,
    WorkOrderDedupeApplyBody,
    WorkOrderDedupeGroup,
    WorkOrderDedupeSuggestedCombined,
    WorkOrderDetailResponse,
    WorkOrderNoteCreate,
    WorkOrderNoteResponse,
    WorkOrderResponse,
    WorkOrderUpdate,
)
from app.agents.work_order_agent import WorkOrderAgent
from app.agents.work_order_dedupe_agent import WorkOrderDedupeAgent
from app.services.graph_service import GraphService
from app.services.llm_service import LLMService
from app.services.notification_dispatch_service import NotificationDispatchService

log = structlog.get_logger("atelier.work_order")

VALID_STATUSES = frozenset(
    {"backlog", "in_progress", "in_review", "done", "archived"}
)

_DEDUPE_FIELD_MAX = 2000
_DEDUPE_BACKLOG_COUNT_WARN = 80

_PATCHABLE_SCALAR_FIELDS: tuple[str, ...] = (
    "title",
    "description",
    "implementation_guide",
    "acceptance_criteria",
    "status",
    "phase",
    "phase_order",
    "assignee_id",
)


@dataclass
class _WorkOrderPatchApply:
    mutated: bool = False
    status_changed: bool = False


def _normalize_work_order_patch(data: dict[str, Any]) -> dict[str, Any]:
    """Map raw ``model_dump(exclude_unset=True)`` entries to normalized assignable values."""
    norm: dict[str, Any] = {}
    if "title" in data and data["title"] is not None:
        norm["title"] = str(data["title"]).strip()
    if "description" in data and data["description"] is not None:
        norm["description"] = str(data["description"]).strip()
    if "implementation_guide" in data:
        ig = data["implementation_guide"]
        norm["implementation_guide"] = str(ig).strip() if ig else None
    if "acceptance_criteria" in data:
        ac = data["acceptance_criteria"]
        norm["acceptance_criteria"] = str(ac).strip() if ac else None
    if "status" in data and data["status"] is not None:
        norm["status"] = data["status"]
    if "phase" in data:
        ph = data["phase"]
        norm["phase"] = str(ph).strip() if ph is not None else None
    if "phase_order" in data:
        norm["phase_order"] = data["phase_order"]
    if "assignee_id" in data:
        norm["assignee_id"] = data["assignee_id"]
    if "section_ids" in data and data["section_ids"] is not None:
        norm["section_ids"] = data["section_ids"]
    return norm


class WorkOrderService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def _user_display_names(self, ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
        if not ids:
            return {}
        r = await self.db.execute(select(User.id, User.display_name).where(User.id.in_(ids)))
        return {row[0]: row[1] for row in r.all()}

    def _user_ids_for_work_orders(self, rows: list[WorkOrder]) -> set[uuid.UUID]:
        out: set[uuid.UUID] = set()
        for w in rows:
            if w.assignee_id is not None:
                out.add(w.assignee_id)
            if w.updated_by_id is not None:
                out.add(w.updated_by_id)
        return out

    def _to_response(
        self,
        wo: WorkOrder,
        *,
        section_ids: list[uuid.UUID],
        assignee_name: str | None,
        updated_by_name: str | None = None,
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
            updated_by_id=wo.updated_by_id,
            updated_by_display_name=updated_by_name,
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
        names = await self._user_display_names(self._user_ids_for_work_orders(list(rows)))
        return [
            self._to_response(
                w,
                section_ids=sec_map.get(w.id, []),
                assignee_name=names.get(w.assignee_id) if w.assignee_id else None,
                updated_by_name=names.get(w.updated_by_id) if w.updated_by_id else None,
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
        names = await self._user_display_names(
            self._user_ids_for_work_orders([wo]),
        )
        base = self._to_response(
            wo,
            section_ids=sec_map.get(wo.id, []),
            assignee_name=names.get(wo.assignee_id) if wo.assignee_id else None,
            updated_by_name=names.get(wo.updated_by_id) if wo.updated_by_id else None,
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
        names = await self._user_display_names(self._user_ids_for_work_orders([wo]))
        return self._to_response(
            wo,
            section_ids=sec_map.get(wo.id, []),
            assignee_name=names.get(wo.assignee_id) if wo.assignee_id else None,
            updated_by_name=names.get(wo.updated_by_id) if wo.updated_by_id else None,
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
        *,
        actor_id: uuid.UUID,
    ) -> WorkOrderResponse:
        wo = await self._get_wo(project_id, work_order_id)
        prev_status = wo.status
        data = body.model_dump(exclude_unset=True)
        if not data:
            sec_map = await self._section_ids_for_work_orders([wo.id])
            names = await self._user_display_names(self._user_ids_for_work_orders([wo]))
            return self._to_response(
                wo,
                section_ids=sec_map.get(wo.id, []),
                assignee_name=names.get(wo.assignee_id) if wo.assignee_id else None,
                updated_by_name=names.get(wo.updated_by_id) if wo.updated_by_id else None,
            )
        norm = _normalize_work_order_patch(data)
        state = _WorkOrderPatchApply()
        if "section_ids" in norm:
            prev_sec = sorted(
                (await self._section_ids_for_work_orders([wo.id])).get(wo.id, [])
            )
            new_sec = sorted(norm["section_ids"])
            if new_sec != prev_sec:
                await self._set_sections(wo.id, project_id, norm["section_ids"])
                state.mutated = True
        for attr in _PATCHABLE_SCALAR_FIELDS:
            if attr not in norm:
                continue
            new_val = norm[attr]
            old_val = getattr(wo, attr)
            if new_val != old_val:
                setattr(wo, attr, new_val)
                state.mutated = True
                if attr == "status":
                    state.status_changed = True
        if state.mutated:
            wo.updated_by_id = actor_id
        await self.db.flush()
        await self.db.refresh(wo)
        if state.status_changed:
            await self._maybe_dispatch_status_notifications(
                wo,
                project_id,
                prev_status=prev_status,
                actor_id=actor_id,
            )
        sec_map = await self._section_ids_for_work_orders([wo.id])
        names = await self._user_display_names(self._user_ids_for_work_orders([wo]))
        return self._to_response(
            wo,
            section_ids=sec_map.get(wo.id, []),
            assignee_name=names.get(wo.assignee_id) if wo.assignee_id else None,
            updated_by_name=names.get(wo.updated_by_id) if wo.updated_by_id else None,
        )

    async def _maybe_dispatch_status_notifications(
        self,
        wo: WorkOrder,
        project_id: uuid.UUID,
        *,
        prev_status: str,
        actor_id: uuid.UUID | None,
    ) -> None:
        if prev_status == wo.status:
            return
        targets: list[uuid.UUID] = []
        if wo.assignee_id is not None:
            targets.append(wo.assignee_id)
        if wo.created_by is not None:
            targets.append(wo.created_by)
        if not targets:
            return
        pr = await self.db.get(Project, project_id)
        if pr is None:
            return
        sw = await self.db.get(Software, pr.software_id)
        if sw is None:
            return
        try:
            await NotificationDispatchService(self.db).work_order_status_changed(
                project_id=project_id,
                software_id=sw.id,
                studio_id=sw.studio_id,
                work_order_title=wo.title,
                old_status=prev_status,
                new_status=wo.status,
                notify_user_ids=targets,
                actor_user_id=actor_id,
            )
            await self.db.flush()
        except Exception:
            log.warning("work_order_status_notification_failed", exc_info=True)

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
        names = await self._user_display_names(self._user_ids_for_work_orders([wo]))
        return self._to_response(
            wo,
            section_ids=sec_map.get(wo.id, []),
            assignee_name=names.get(wo.assignee_id) if wo.assignee_id else None,
            updated_by_name=names.get(wo.updated_by_id) if wo.updated_by_id else None,
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

        ids = list(body.section_ids)
        sec_rows = await self.db.execute(select(Section).where(Section.id.in_(ids)))
        by_id: dict[uuid.UUID, Section] = {s.id: s for s in sec_rows.scalars().all()}
        sections: list[Section] = []
        for sid in ids:
            sec = by_id.get(sid)
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

        ctx = TokenUsageScope(
            studio_id=studio_id,
            software_id=software_id,
            project_id=project_id,
            user_id=user_id,
        )
        llm = LLMService(self.db)
        parsed = await WorkOrderAgent(self.db, llm).generate_work_order_batch(
            ctx,
            sw_name=sw_name,
            def_block=def_block,
            sections_blob=sections_blob,
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
        names = await self._user_display_names(self._user_ids_for_work_orders(created))
        return [
            self._to_response(
                w,
                section_ids=sec_map.get(w.id, []),
                assignee_name=names.get(w.assignee_id) if w.assignee_id else None,
                updated_by_name=names.get(w.updated_by_id) if w.updated_by_id else None,
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

    def _truncate_for_dedupe_prompt(self, text: str | None, max_len: int) -> str:
        s = (text or "").strip()
        if len(s) <= max_len:
            return s
        return s[: max_len - 1] + "…"

    async def analyze_backlog_duplicates(
        self,
        project_id: uuid.UUID,
        *,
        user_id: uuid.UUID,
    ) -> WorkOrderDedupeAnalyzeResponse:
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

        q = select(WorkOrder).where(
            WorkOrder.project_id == project_id,
            WorkOrder.status == "backlog",
        )
        backlog_rows = list((await self.db.execute(q)).scalars().unique().all())
        if len(backlog_rows) <= 1:
            return WorkOrderDedupeAnalyzeResponse(groups=[])

        if len(backlog_rows) > _DEDUPE_BACKLOG_COUNT_WARN:
            log.warning(
                "work_order_dedupe_large_backlog",
                project_id=str(project_id),
                count=len(backlog_rows),
            )

        valid_ids = {w.id for w in backlog_rows}

        lines: list[str] = []
        for w in sorted(backlog_rows, key=lambda x: x.title):
            desc = self._truncate_for_dedupe_prompt(
                w.description, _DEDUPE_FIELD_MAX
            )
            ig = self._truncate_for_dedupe_prompt(
                w.implementation_guide, _DEDUPE_FIELD_MAX
            )
            ac = self._truncate_for_dedupe_prompt(
                w.acceptance_criteria, _DEDUPE_FIELD_MAX
            )
            lines.append(
                f"- id={w.id}\n  title: {w.title}\n  description:\n{desc}\n"
                f"  implementation_guide:\n{ig or '(none)'}\n"
                f"  acceptance_criteria:\n{ac or '(none)'}\n"
            )
        backlog_blob = "\n".join(lines)
        def_block = (software.definition or "").strip() or "(No software definition.)"
        sw_name = software.name

        ctx = TokenUsageScope(
            studio_id=studio_id,
            software_id=software_id,
            project_id=project_id,
            user_id=user_id,
        )
        llm = LLMService(self.db)
        parsed = await WorkOrderDedupeAgent(self.db, llm).analyze(
            ctx,
            sw_name=sw_name,
            def_block=def_block,
            backlog_blob=backlog_blob,
        )
        raw_groups = parsed.get("groups")
        if not isinstance(raw_groups, list):
            raise ApiError(
                status_code=502,
                code="LLM_INVALID_SHAPE",
                message="LLM JSON must contain a 'groups' array.",
            )

        out_groups: list[WorkOrderDedupeGroup] = []
        for g in raw_groups:
            if not isinstance(g, dict):
                continue
            raw_ids = g.get("work_order_ids")
            if not isinstance(raw_ids, list):
                continue
            resolved: list[uuid.UUID] = []
            for x in raw_ids:
                if not isinstance(x, str):
                    continue
                try:
                    uid = uuid.UUID(x.strip())
                except ValueError:
                    continue
                if uid not in valid_ids:
                    continue
                if uid not in resolved:
                    resolved.append(uid)
            if len(resolved) < 2:
                continue
            rationale = str(g.get("rationale") or "").strip()
            if not rationale:
                continue
            sc_raw = g.get("suggested_combined")
            if not isinstance(sc_raw, dict):
                continue
            title = str(sc_raw.get("title") or "").strip()
            desc = str(sc_raw.get("description") or "").strip()
            if not title or not desc:
                continue
            ig = str(sc_raw.get("implementation_guide") or "").strip() or None
            ac = str(sc_raw.get("acceptance_criteria") or "").strip() or None
            out_groups.append(
                WorkOrderDedupeGroup(
                    work_order_ids=resolved,
                    rationale=rationale,
                    suggested_combined=WorkOrderDedupeSuggestedCombined(
                        title=title[:512],
                        description=desc,
                        implementation_guide=ig,
                        acceptance_criteria=ac,
                    ),
                )
            )

        return WorkOrderDedupeAnalyzeResponse(groups=out_groups)

    async def _rewire_graph_edges_for_dedupe_merge(
        self,
        project_id: uuid.UUID,
        keep_id: uuid.UUID,
        archive_ids: list[uuid.UUID],
    ) -> None:
        archive_set = frozenset(archive_ids)
        r = await self.db.execute(
            select(GraphEdge).where(GraphEdge.project_id == project_id)
        )
        edges = r.scalars().all()
        replacements: list[tuple[GraphEdge, uuid.UUID, uuid.UUID]] = []

        for e in edges:
            ns = (
                keep_id
                if e.source_type == "work_order" and e.source_id in archive_set
                else e.source_id
            )
            nt = (
                keep_id
                if e.target_type == "work_order" and e.target_id in archive_set
                else e.target_id
            )
            if ns != e.source_id or nt != e.target_id:
                replacements.append((e, ns, nt))

        for e, _, _ in replacements:
            await self.db.delete(e)
        await self.db.flush()

        gs = GraphService(self.db)
        for e, ns, nt in replacements:
            if (
                e.source_type == "work_order"
                and e.target_type == "work_order"
                and ns == nt
                and e.edge_type == "depends_on"
            ):
                continue
            await gs.add_edge(
                project_id=project_id,
                source_type=e.source_type,
                source_id=ns,
                target_type=e.target_type,
                target_id=nt,
                edge_type=e.edge_type,
            )
        await self.db.flush()

    async def _union_sections_from_archived_work_orders(
        self,
        project_id: uuid.UUID,
        keep_id: uuid.UUID,
        archive_ids: list[uuid.UUID],
    ) -> None:
        existing = set(
            (
                await self.db.execute(
                    select(WorkOrderSection.section_id).where(
                        WorkOrderSection.work_order_id == keep_id
                    )
                )
            ).scalars().all()
        )
        gs = GraphService(self.db)
        for aid in archive_ids:
            sec_rows = (
                await self.db.execute(
                    select(WorkOrderSection.section_id).where(
                        WorkOrderSection.work_order_id == aid
                    )
                )
            ).scalars().all()
            for sid in sec_rows:
                if sid in existing:
                    continue
                existing.add(sid)
                self.db.add(
                    WorkOrderSection(work_order_id=keep_id, section_id=sid)
                )
                await self.db.flush()
                await gs.add_edge(
                    project_id=project_id,
                    source_type="section",
                    source_id=sid,
                    target_type="work_order",
                    target_id=keep_id,
                    edge_type="generates",
                )

    async def apply_backlog_dedupe_merge(
        self,
        project_id: uuid.UUID,
        body: WorkOrderDedupeApplyBody,
        *,
        actor_id: uuid.UUID,
    ) -> WorkOrderResponse:
        archive_ids = list(dict.fromkeys(body.archive_work_order_ids))
        keep_id = body.keep_work_order_id
        if keep_id in archive_ids:
            raise ApiError(
                status_code=422,
                code="INVALID_MERGE",
                message="keep_work_order_id must not appear in archive_work_order_ids.",
            )

        keep = await self._get_wo(project_id, keep_id)
        if keep.status != "backlog":
            raise ApiError(
                status_code=422,
                code="INVALID_MERGE",
                message="Kept work order must be in backlog.",
            )

        archived_titles: list[str] = []
        for aid in archive_ids:
            wo = await self._get_wo(project_id, aid)
            if wo.status != "backlog":
                raise ApiError(
                    status_code=422,
                    code="INVALID_MERGE",
                    message="Archived work orders must be in backlog.",
                )
            archived_titles.append(wo.title)

        mf = body.merged_fields
        keep.title = mf.title.strip()[:512]
        keep.description = mf.description.strip()
        keep.implementation_guide = (
            mf.implementation_guide.strip() if mf.implementation_guide else None
        )
        keep.acceptance_criteria = (
            mf.acceptance_criteria.strip() if mf.acceptance_criteria else None
        )
        keep.updated_by_id = actor_id

        await self._union_sections_from_archived_work_orders(
            project_id, keep_id, archive_ids
        )

        for aid in archive_ids:
            wo = await self.db.get(WorkOrder, aid)
            if wo is None:
                continue
            wo.status = "archived"
            wo.updated_by_id = actor_id

        await self.db.flush()

        await self._rewire_graph_edges_for_dedupe_merge(
            project_id, keep_id, archive_ids
        )

        titles_blob = ", ".join(archived_titles) if archived_titles else ""
        note_body = (
            f"Merged duplicate backlog work orders into this item (archived): {titles_blob}"
        )
        self.db.add(
            WorkOrderNote(
                id=uuid.uuid4(),
                work_order_id=keep_id,
                author_id=actor_id,
                source="dedupe_merge",
                content=note_body[:8000],
            )
        )
        await self.db.flush()
        await self.db.refresh(keep)

        sec_map = await self._section_ids_for_work_orders([keep.id])
        names = await self._user_display_names(self._user_ids_for_work_orders([keep]))
        return self._to_response(
            keep,
            section_ids=sec_map.get(keep.id, []),
            assignee_name=names.get(keep.assignee_id) if keep.assignee_id else None,
            updated_by_name=names.get(keep.updated_by_id) if keep.updated_by_id else None,
        )
