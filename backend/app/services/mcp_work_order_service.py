"""MCP work-order payloads for coding agents (Slice 12)."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.exceptions import ApiError
from app.models import GraphEdge, Project, Section, Software, WorkOrder
from app.models.work_order import WorkOrderSection
from app.schemas.token_context import TokenContext
from app.services.rag_service import RAGService
from app.services.token_tracker import record_usage


class McpWorkOrderService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def _ensure_wo_in_studio(
        self, studio_id: uuid.UUID, work_order_id: uuid.UUID
    ) -> WorkOrder:
        wo = await self.db.get(WorkOrder, work_order_id)
        if wo is None:
            raise ApiError(
                status_code=404, code="NOT_FOUND", message="Work order not found"
            )
        pr = await self.db.get(Project, wo.project_id)
        if pr is None:
            raise ApiError(
                status_code=404, code="NOT_FOUND", message="Project not found"
            )
        sw = await self.db.get(Software, pr.software_id)
        if sw is None or sw.studio_id != studio_id:
            raise ApiError(
                status_code=403,
                code="FORBIDDEN",
                message="Work order not in this studio",
            )
        return wo

    async def list_for_studio(
        self,
        studio_id: uuid.UUID,
        *,
        project_id: uuid.UUID | None = None,
        status: str | None = None,
        assignee_id: uuid.UUID | None = None,
        phase: str | None = None,
    ) -> list[dict[str, Any]]:
        q = (
            select(WorkOrder)
            .join(Project, WorkOrder.project_id == Project.id)
            .join(Software, Project.software_id == Software.id)
            .where(Software.studio_id == studio_id)
            .options(selectinload(WorkOrder.sections))
            .order_by(WorkOrder.updated_at.desc())
        )
        if project_id is not None:
            q = q.where(WorkOrder.project_id == project_id)
        if status is not None:
            q = q.where(WorkOrder.status == status)
        if assignee_id is not None:
            q = q.where(WorkOrder.assignee_id == assignee_id)
        if phase is not None:
            q = q.where(WorkOrder.phase == phase)
        rows = list((await self.db.execute(q)).scalars().unique().all())

        sw_id: uuid.UUID | None = None
        proj_for_ctx: uuid.UUID | None = None
        if rows:
            first_pr = await self.db.get(Project, rows[0].project_id)
            if first_pr is not None:
                sw_chk = await self.db.get(Software, first_pr.software_id)
                if sw_chk is not None and sw_chk.studio_id == studio_id:
                    sw_id = first_pr.software_id
                    proj_for_ctx = first_pr.id
        elif project_id is not None:
            pr_only = await self.db.get(Project, project_id)
            if pr_only is not None:
                sw_chk = await self.db.get(Software, pr_only.software_id)
                if sw_chk is not None and sw_chk.studio_id == studio_id:
                    sw_id = pr_only.software_id
                    proj_for_ctx = project_id

        ctx = TokenContext(
            studio_id=studio_id,
            software_id=sw_id,
            project_id=proj_for_ctx,
            user_id=None,
        )
        await record_usage(
            self.db,
            ctx,
            call_type="mcp",
            model="mcp_list_work_orders",
            input_tokens=0,
            output_tokens=0,
        )

        return [
            {
                "id": str(w.id),
                "project_id": str(w.project_id),
                "title": w.title,
                "status": w.status,
                "phase": w.phase,
            }
            for w in rows
        ]

    async def pull_payload(
        self, studio_id: uuid.UUID, work_order_id: uuid.UUID
    ) -> dict[str, Any]:
        wo = await self._ensure_wo_in_studio(studio_id, work_order_id)
        pr = await self.db.get(Project, wo.project_id)
        if pr is None:
            raise ApiError(
                status_code=404, code="NOT_FOUND", message="Project not found"
            )
        sw = await self.db.get(Software, pr.software_id)
        if sw is None:
            raise ApiError(
                status_code=404, code="NOT_FOUND", message="Software not found"
            )

        ctx = TokenContext(
            studio_id=studio_id,
            software_id=sw.id,
            project_id=pr.id,
            user_id=None,
        )
        await record_usage(
            self.db,
            ctx,
            call_type="mcp",
            model="mcp_context_pull",
            input_tokens=0,
            output_tokens=0,
        )

        sec_stmt = (
            select(Section)
            .join(
                WorkOrderSection,
                WorkOrderSection.section_id == Section.id,
            )
            .where(WorkOrderSection.work_order_id == wo.id)
        )
        sections = list((await self.db.execute(sec_stmt)).scalars().all())
        linked = [{"title": s.title, "content": s.content or ""} for s in sections]

        query = f"{wo.title}\n{wo.description}"
        cur_sid = sections[0].id if sections else None
        rag = await RAGService(self.db).build_context(
            query=query,
            project_id=pr.id,
            current_section_id=cur_sid,
            token_budget=4000,
        )

        rel_ids: list[uuid.UUID] = []
        edge_rows = (
            (
                await self.db.execute(
                    select(GraphEdge).where(
                        GraphEdge.project_id == pr.id,
                        GraphEdge.edge_type == "depends_on",
                    )
                )
            )
            .scalars()
            .all()
        )
        for e in edge_rows:
            if e.source_type == "work_order" and e.source_id == wo.id:
                if e.target_type == "work_order":
                    rel_ids.append(e.target_id)
            elif e.target_type == "work_order" and e.target_id == wo.id:
                if e.source_type == "work_order":
                    rel_ids.append(e.source_id)

        related: list[dict[str, str]] = []
        for rid in rel_ids[:20]:
            rw = await self.db.get(WorkOrder, rid)
            if rw:
                related.append(
                    {"id": str(rw.id), "title": rw.title, "status": rw.status}
                )

        return {
            "id": str(wo.id),
            "title": wo.title,
            "description": wo.description,
            "acceptance_criteria": wo.acceptance_criteria or "",
            "implementation_guide": wo.implementation_guide or "",
            "phase": wo.phase,
            "status": wo.status,
            "software_definition": sw.definition or "",
            "linked_sections": linked,
            "artifact_context": rag.text,
            "related_work_orders": related,
        }
