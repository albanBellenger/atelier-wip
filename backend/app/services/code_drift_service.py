"""Software-wide code drift detection vs indexed repository (Slice 16e)."""

from __future__ import annotations

import uuid
from typing import Any

import structlog
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.code_drift_section_agent import CodeDriftSectionAgent
from app.agents.code_drift_work_order_agent import CodeDriftWorkOrderAgent
from app.exceptions import ApiError
from app.models import CodebaseFile, Issue, Project, Section, Software, WorkOrder
from app.schemas.code_drift import CodeDriftRunResult
from app.schemas.token_usage_scope import TokenUsageScope
from app.services.codebase_rag_service import CodebaseRagService
from app.services.codebase_repo_map import repo_map_lru
from app.services.codebase_service import CodebaseService
from app.services.embedding_token_usage_scope import usage_scope_for_software
from app.services.graph_service import GraphService
from app.services.llm_service import LLMService
from app.services.section_service import effective_section_plaintext

log = structlog.get_logger("atelier.code_drift")


class CodeDriftService:
    def __init__(self, db: AsyncSession, llm: LLMService) -> None:
        self.db = db
        self.llm = llm

    async def _clear_open_auto_code_drift_issues(self, software_id: uuid.UUID) -> None:
        await self.db.execute(
            delete(Issue).where(
                Issue.software_id == software_id,
                Issue.status == "open",
                Issue.origin == "auto",
                Issue.kind.in_(("code_drift_section", "code_drift_work_order")),
            )
        )

    @staticmethod
    def _normalize_code_refs(raw: object) -> list[dict[str, object]]:
        out: list[dict[str, object]] = []
        if not isinstance(raw, list):
            return out
        for item in raw:
            if not isinstance(item, dict):
                continue
            path = str(item.get("path") or "").strip()
            if not path:
                continue
            try:
                sl = int(item.get("start_line"))
                el = int(item.get("end_line"))
            except (TypeError, ValueError):
                continue
            out.append({"path": path, "start_line": sl, "end_line": el})
        return out

    async def _software_projects_non_archived(self, software_id: uuid.UUID) -> list[Project]:
        return list(
            (
                await self.db.execute(
                    select(Project).where(
                        Project.software_id == software_id,
                        Project.archived.is_(False),
                    )
                )
            )
            .scalars()
            .all()
        )

    async def _add_drift_edge_section(
        self,
        *,
        section: Section,
        issue_id: uuid.UUID,
        software_id: uuid.UUID,
    ) -> None:
        graph = GraphService(self.db)
        if section.project_id is not None:
            await graph.add_edge(
                project_id=section.project_id,
                source_type="section",
                source_id=section.id,
                target_type="issue",
                target_id=issue_id,
                edge_type="drifts_from_code",
            )
            return
        for pr in await self._software_projects_non_archived(software_id):
            await graph.add_edge(
                project_id=pr.id,
                source_type="software_doc_section",
                source_id=section.id,
                target_type="issue",
                target_id=issue_id,
                edge_type="drifts_from_code",
            )

    async def _add_drift_edge_work_order(
        self,
        *,
        work_order_id: uuid.UUID,
        project_id: uuid.UUID,
        issue_id: uuid.UUID,
    ) -> None:
        graph = GraphService(self.db)
        await graph.add_edge(
            project_id=project_id,
            source_type="work_order",
            source_id=work_order_id,
            target_type="issue",
            target_id=issue_id,
            edge_type="drifts_from_code",
        )

    async def run_for_software(
        self,
        software_id: uuid.UUID,
        run_actor_id: uuid.UUID,
    ) -> CodeDriftRunResult:
        sw = await self.db.get(Software, software_id)
        if sw is None:
            raise ApiError(status_code=404, code="NOT_FOUND", message="Software not found.")

        snap = await CodebaseService(self.db).get_ready_snapshot(software_id)
        if snap is None:
            return CodeDriftRunResult(skipped_reason="not_indexed")

        scope_row = await usage_scope_for_software(self.db, software_id)
        if scope_row is None:
            raise ApiError(status_code=404, code="NOT_FOUND", message="Software not found.")
        ctx = TokenUsageScope(
            studio_id=scope_row.studio_id,
            software_id=software_id,
            project_id=None,
            user_id=run_actor_id,
        )
        try:
            await self.llm.ensure_openai_llm_ready(
                usage_scope=ctx,
                call_source="code_drift_section",
            )
        except ApiError as e:
            log.warning("code_drift_llm_not_ready", code=e.error_code)
            return CodeDriftRunResult(skipped_reason="llm_not_ready")

        await self._clear_open_auto_code_drift_issues(software_id)

        paths = list(
            (
                await self.db.scalars(
                    select(CodebaseFile.path).where(CodebaseFile.snapshot_id == snap.id)
                )
            ).all()
        )
        rm = repo_map_lru(str(snap.id), 1200, paths)
        ranked = rm.get("ranked_paths")
        if not isinstance(ranked, list):
            ranked = []
        repo_blob = CodebaseService._repo_map_blob([str(p) for p in ranked], max_lines=60)

        doc_rows = (
            (
                await self.db.execute(
                    select(Section).where(
                        Section.software_id == software_id,
                        Section.project_id.is_(None),
                    )
                )
            )
            .scalars()
            .all()
        )
        proj_sec_rows = (
            (
                await self.db.execute(
                    select(Section)
                    .join(Project, Section.project_id == Project.id)
                    .where(
                        Project.software_id == software_id,
                        Project.archived.is_(False),
                    )
                )
            )
            .scalars()
            .all()
        )
        combined_sections: list[Section] = list(doc_rows) + list(proj_sec_rows)
        combined_sections.sort(key=lambda s: s.updated_at, reverse=True)
        combined_sections = combined_sections[:50]

        wo_rows = (
            (
                await self.db.execute(
                    select(WorkOrder)
                    .join(Project, WorkOrder.project_id == Project.id)
                    .where(
                        Project.software_id == software_id,
                        Project.archived.is_(False),
                        WorkOrder.status.in_(("backlog", "in_progress", "in_review")),
                    )
                    .order_by(WorkOrder.updated_at.desc())
                    .limit(50)
                )
            )
            .scalars()
            .all()
        )

        rag = CodebaseRagService(self.db)
        sec_agent = CodeDriftSectionAgent(self.db, self.llm)
        wo_agent = CodeDriftWorkOrderAgent(self.db, self.llm)
        sections_evaluated = 0
        sections_flagged = 0
        work_orders_evaluated = 0
        work_orders_flagged = 0
        def_block = (sw.definition or "").strip() or "(No software definition.)"

        for sec in combined_sections:
            sections_evaluated += 1
            plain = effective_section_plaintext(sec.content, sec.yjs_state) or ""
            query_text = f"{sec.title} {plain[:800]}".strip()
            hits = await rag.retrieve_chunks_for_text(
                snapshot_id=snap.id,
                software_id=software_id,
                query_text=query_text,
                limit=8,
            )
            symbol_paths: list[str] = []
            if len(hits) < 3:
                symbol_paths = await CodebaseService(self.db)._symbol_paths_for_title_tokens(
                    snap.id, sec.title
                )
            chunks_blob = CodebaseService._code_chunks_blob(hits, symbol_paths)
            try:
                parsed = await sec_agent.analyse(
                    ctx,
                    sw_name=sw.name,
                    def_block=def_block,
                    section_title=sec.title,
                    section_body=plain[:12000],
                    repo_map_blob=repo_blob,
                    code_chunks_blob=chunks_blob,
                )
            except ApiError as e:
                log.warning("code_drift_section_llm_failed", code=e.error_code)
                continue
            if not isinstance(parsed, dict):
                continue
            if not bool(parsed.get("likely_drifted")):
                continue
            reason = str(parsed.get("reason") or "").strip()
            if not reason:
                continue
            severity = str(parsed.get("severity") or "low")
            if severity not in ("low", "medium", "high"):
                severity = "low"
            refs = self._normalize_code_refs(parsed.get("code_refs"))
            payload: dict[str, Any] = {"severity": severity, "code_refs": refs}
            issue = Issue(
                id=uuid.uuid4(),
                project_id=sec.project_id,
                software_id=software_id,
                work_order_id=None,
                kind="code_drift_section",
                triggered_by=None,
                section_a_id=sec.id,
                section_b_id=None,
                description=reason[:2000],
                status="open",
                origin="auto",
                run_actor_id=run_actor_id,
                payload_json=payload,
            )
            self.db.add(issue)
            await self.db.flush()
            await self._add_drift_edge_section(
                section=sec, issue_id=issue.id, software_id=software_id
            )
            sections_flagged += 1

        for wo in wo_rows:
            work_orders_evaluated += 1
            ac = (wo.acceptance_criteria or "")[:400]
            query_text = f"{wo.title} {wo.description} {ac}".strip()
            hits = await rag.retrieve_chunks_for_text(
                snapshot_id=snap.id,
                software_id=software_id,
                query_text=query_text,
                limit=8,
            )
            symbol_paths = []
            if len(hits) < 3:
                symbol_paths = await CodebaseService(self.db)._symbol_paths_for_title_tokens(
                    snap.id, wo.title
                )
            chunks_blob = CodebaseService._code_chunks_blob(hits, symbol_paths)
            try:
                parsed = await wo_agent.analyse(
                    ctx,
                    sw_name=sw.name,
                    def_block=def_block,
                    wo_title=wo.title,
                    wo_description=wo.description or "",
                    wo_acceptance_criteria=wo.acceptance_criteria or "",
                    repo_map_blob=repo_blob,
                    code_chunks_blob=chunks_blob,
                )
            except ApiError as e:
                log.warning("code_drift_wo_llm_failed", code=e.error_code)
                continue
            if not isinstance(parsed, dict):
                continue
            verdict = str(parsed.get("verdict") or "")
            if verdict == "complete" or verdict not in ("partial", "missing"):
                continue
            reason = str(parsed.get("reason") or "").strip()
            if not reason:
                continue
            refs = self._normalize_code_refs(parsed.get("code_refs"))
            payload = {"verdict": verdict, "code_refs": refs}
            issue = Issue(
                id=uuid.uuid4(),
                project_id=wo.project_id,
                software_id=software_id,
                work_order_id=wo.id,
                kind="code_drift_work_order",
                triggered_by=None,
                section_a_id=None,
                section_b_id=None,
                description=reason[:2000],
                status="open",
                origin="auto",
                run_actor_id=run_actor_id,
                payload_json=payload,
            )
            self.db.add(issue)
            await self.db.flush()
            await self._add_drift_edge_work_order(
                work_order_id=wo.id,
                project_id=wo.project_id,
                issue_id=issue.id,
            )
            work_orders_flagged += 1

        await self.db.flush()
        return CodeDriftRunResult(
            sections_evaluated=sections_evaluated,
            sections_flagged=sections_flagged,
            work_orders_evaluated=work_orders_evaluated,
            work_orders_flagged=work_orders_flagged,
        )
