"""Compose outline-editor health metrics for a section."""

from __future__ import annotations

import asyncio
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ApiError
from app.models import Issue, WorkOrder, WorkOrderSection
from app.models.project import Section
from app.schemas.section_health import SectionHealthOut
from app.schemas.section_outline_health import SectionOutlineHealthLite
from app.services.citation_health_service import CitationHealthService
from app.services.rag_service import RAGService


class SectionHealthService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def batch_outline_health_lite(
        self,
        *,
        project_id: uuid.UUID,
        sections: list[Section],
        token_budget: int = 6000,
        max_concurrent_rag: int = 5,
    ) -> dict[uuid.UUID, SectionOutlineHealthLite]:
        """Drift/gap SQL batch + bounded-concurrency RAG token totals (no citation LLM)."""
        if not sections:
            return {}
        ids = [s.id for s in sections]
        drift_map: dict[uuid.UUID, int] = {sid: 0 for sid in ids}
        gap_map: dict[uuid.UUID, int] = {sid: 0 for sid in ids}

        drift_rows = (
            await self.db.execute(
                select(
                    WorkOrderSection.section_id,
                    func.count(func.distinct(WorkOrderSection.work_order_id)),
                )
                .select_from(WorkOrderSection)
                .join(WorkOrder, WorkOrderSection.work_order_id == WorkOrder.id)
                .where(
                    WorkOrder.project_id == project_id,
                    WorkOrderSection.section_id.in_(ids),
                    WorkOrder.is_stale.is_(True),
                )
                .group_by(WorkOrderSection.section_id)
            )
        ).all()
        for sid, cnt in drift_rows:
            drift_map[sid] = int(cnt or 0)

        gap_rows = (
            await self.db.execute(
                select(Issue.section_a_id, func.count(Issue.id))
                .where(
                    Issue.project_id == project_id,
                    Issue.status == "open",
                    Issue.section_b_id.is_(None),
                    Issue.section_a_id.in_(ids),
                )
                .group_by(Issue.section_a_id)
            )
        ).all()
        for sid, cnt in gap_rows:
            if sid is not None:
                gap_map[sid] = int(cnt or 0)

        sem = asyncio.Semaphore(max_concurrent_rag)
        rag = RAGService(self.db)

        async def tokens_for(sid: uuid.UUID) -> tuple[uuid.UUID, int, int]:
            async with sem:
                preview = await rag.build_context_with_blocks(
                    "",
                    project_id,
                    sid,
                    token_budget=token_budget,
                    include_git_history=False,
                    include_debug_raw_rag=False,
                )
                return sid, preview.total_tokens, preview.budget_tokens

        tok_results = await asyncio.gather(*[tokens_for(sid) for sid in ids])
        tok_by: dict[uuid.UUID, tuple[int, int]] = {
            sid: (used, budget) for sid, used, budget in tok_results
        }

        out: dict[uuid.UUID, SectionOutlineHealthLite] = {}
        for sid in ids:
            used, budget = tok_by[sid]
            out[sid] = SectionOutlineHealthLite(
                drift_count=drift_map.get(sid, 0),
                gap_count=gap_map.get(sid, 0),
                token_used=used,
                token_budget=budget,
                citation_scan_pending=True,
            )
        return out

    async def get_section_health(
        self,
        *,
        project_id: uuid.UUID,
        section_id: uuid.UUID,
        user_id: uuid.UUID,
        token_budget: int = 6000,
    ) -> SectionHealthOut:
        sec = await self.db.get(Section, section_id)
        if sec is None or sec.project_id != project_id:
            raise ApiError(status_code=404, code="NOT_FOUND", message="Section not found")

        drift_r = await self.db.execute(
            select(func.count(func.distinct(WorkOrderSection.work_order_id)))
            .select_from(WorkOrderSection)
            .join(WorkOrder, WorkOrderSection.work_order_id == WorkOrder.id)
            .where(
                WorkOrder.project_id == project_id,
                WorkOrderSection.section_id == section_id,
                WorkOrder.is_stale.is_(True),
            )
        )
        drift_count = int(drift_r.scalar_one() or 0)

        gap_r = await self.db.execute(
            select(func.count(Issue.id)).where(
                Issue.project_id == project_id,
                Issue.status == "open",
                Issue.section_b_id.is_(None),
                Issue.section_a_id == section_id,
            )
        )
        gap_count = int(gap_r.scalar_one() or 0)

        preview = await RAGService(self.db).build_context_with_blocks(
            "",
            project_id,
            section_id,
            token_budget=token_budget,
            include_git_history=False,
            include_debug_raw_rag=False,
        )

        cite = await CitationHealthService(self.db).analyze_section(
            project_id=project_id,
            section_id=section_id,
            user_id=user_id,
        )

        drawer_drift = (
            f"{drift_count} linked work order(s) flagged stale — review before publish."
            if drift_count
            else "No stale linked work orders for this section."
        )
        drawer_gap = (
            f"{gap_count} open section-scoped issue(s) (gaps or follow-ups)."
            if gap_count
            else "No open single-section issues."
        )
        drawer_tokens = (
            f"{preview.total_tokens:,} of {preview.budget_tokens:,} tokens in the default "
            "RAG preview budget for this section."
        )
        drawer_sources = (
            f"{cite.citations_resolved} grounded claim(s); {cite.citations_missing} "
            "claim(s) may lack explicit traceability."
        )

        return SectionHealthOut(
            drift_count=drift_count,
            gap_count=gap_count,
            token_used=preview.total_tokens,
            token_budget=preview.budget_tokens,
            citations_resolved=cite.citations_resolved,
            citations_missing=cite.citations_missing,
            drawer_drift=drawer_drift,
            drawer_gap=drawer_gap,
            drawer_tokens=drawer_tokens,
            drawer_sources=drawer_sources,
        )
