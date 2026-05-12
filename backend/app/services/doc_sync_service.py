"""Orchestrate doc sync proposals after work order completion (Slice 16f)."""

from __future__ import annotations

import re
import uuid

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.doc_sync_agent import DocSyncAgent
from app.models import Issue, Project, Section, Software, WorkOrder
from app.schemas.doc_sync import DocSyncRunResult
from app.schemas.token_usage_scope import TokenUsageScope
from app.services.codebase_rag_service import CodebaseRagService
from app.services.codebase_service import CodebaseService
from app.services.graph_service import GraphService
from app.services.llm_service import LLMService
from app.services.section_service import effective_section_plaintext

log = structlog.get_logger("atelier.doc_sync")

_WORD_RE = re.compile(r"[a-z0-9]{3,}", re.I)


def _tokens(text: str) -> set[str]:
    return {m.group(0).lower() for m in _WORD_RE.finditer(text or "")}


def _overlap_score(query: str, body: str) -> int:
    qt = _tokens(query)
    if not qt:
        return 0
    bt = _tokens(body)
    return len(qt & bt)


def _format_candidate_blob(sections: list[Section]) -> str:
    parts: list[str] = []
    for s in sections:
        plain = effective_section_plaintext(s.content, s.yjs_state) or ""
        parts.append(
            "--- Candidate ---\n"
            f"Section id: {s.id}\n"
            f"Title: {s.title}\n"
            f"Slug: {s.slug}\n"
            "Markdown:\n"
            f"{plain}\n"
        )
    return "\n".join(parts)


def _format_code_chunks_blob(chunks: list[dict[str, object]]) -> str:
    lines: list[str] = []
    for h in chunks:
        path = str(h.get("path") or "")
        sl = h.get("start_line")
        el = h.get("end_line")
        snip = str(h.get("snippet") or "").replace("\n", " ")
        lines.append(f"- {path} · L{sl}-{el}: {snip}")
    return "\n".join(lines) if lines else "(No code chunks retrieved.)"


class DocSyncService:
    def __init__(self, db: AsyncSession, llm: LLMService) -> None:
        self.db = db
        self.llm = llm

    async def _rank_software_doc_sections(
        self,
        software_id: uuid.UUID,
        query: str,
        *,
        limit: int,
    ) -> list[Section]:
        q = select(Section).where(
            Section.software_id == software_id,
            Section.project_id.is_(None),
        )
        rows = list((await self.db.execute(q)).scalars().all())
        scored: list[tuple[int, Section]] = []
        for sec in rows:
            body = effective_section_plaintext(sec.content, sec.yjs_state) or ""
            blob = f"{sec.title}\n{sec.slug}\n{body}"
            scored.append((_overlap_score(query, blob), sec))
        scored.sort(key=lambda x: (-x[0], x[1].title))
        return [s for _, s in scored[:limit]]

    async def propose_for_work_order(
        self,
        work_order_id: uuid.UUID,
        *,
        run_actor_id: uuid.UUID,
    ) -> DocSyncRunResult:
        wo = await self.db.get(WorkOrder, work_order_id)
        if wo is None:
            return DocSyncRunResult(skipped_reason="work_order_not_found")
        pr = await self.db.get(Project, wo.project_id)
        if pr is None:
            return DocSyncRunResult(skipped_reason="project_not_found")
        sw = await self.db.get(Software, pr.software_id)
        if sw is None:
            return DocSyncRunResult(skipped_reason="software_not_found")

        ready = await CodebaseService(self.db).get_ready_snapshot(sw.id)
        if ready is None:
            return DocSyncRunResult(skipped_reason="not_indexed")

        wo_blob = f"{wo.title}\n{wo.description}\n{wo.acceptance_criteria or ''}"
        candidates = await self._rank_software_doc_sections(
            sw.id,
            wo_blob,
            limit=5,
        )
        if not candidates:
            return DocSyncRunResult(skipped_reason="no_software_doc_sections")

        cand_ids = {s.id for s in candidates}
        candidate_blob = _format_candidate_blob(candidates)

        rag = CodebaseRagService(self.db)
        qtext = f"{wo.title} {wo.description}"
        chunks = await rag.retrieve_chunks_for_text(
            snapshot_id=ready.id,
            software_id=sw.id,
            query_text=qtext,
            limit=8,
        )
        code_blob = _format_code_chunks_blob(chunks)

        ctx = TokenUsageScope(
            studio_id=sw.studio_id,
            software_id=sw.id,
            project_id=pr.id,
            work_order_id=wo.id,
            user_id=run_actor_id,
        )
        def_block = (sw.definition or "").strip() or "(No software definition.)"
        parsed = await DocSyncAgent(self.db, self.llm).propose_patches(
            ctx,
            sw_name=sw.name,
            def_block=def_block,
            wo_title=wo.title,
            wo_description=wo.description,
            wo_acceptance_criteria=wo.acceptance_criteria or "(none)",
            candidate_sections_blob=candidate_blob,
            code_chunks_blob=code_blob,
        )

        raw_props = parsed.get("proposals")
        if not isinstance(raw_props, list):
            log.warning("doc_sync_invalid_proposals_shape", work_order_id=str(work_order_id))
            return DocSyncRunResult(
                proposals_total=0,
                proposals_kept=0,
                proposals_dropped=0,
            )

        proposals_total = len(raw_props)
        kept = 0
        dropped = 0
        gs = GraphService(self.db)

        for item in raw_props:
            if not isinstance(item, dict):
                dropped += 1
                continue
            sid_raw = item.get("section_id")
            rationale = str(item.get("rationale") or "").strip()
            replacement = str(item.get("replacement_markdown") or "")
            if not isinstance(sid_raw, str) or not rationale or not replacement:
                dropped += 1
                continue
            try:
                section_uuid = uuid.UUID(sid_raw.strip())
            except ValueError:
                dropped += 1
                log.warning(
                    "doc_sync_bad_section_id",
                    work_order_id=str(work_order_id),
                    section_id=sid_raw,
                )
                continue
            if section_uuid not in cand_ids:
                dropped += 1
                log.warning(
                    "doc_sync_unknown_section_id",
                    work_order_id=str(work_order_id),
                    section_id=str(section_uuid),
                )
                continue

            issue = Issue(
                id=uuid.uuid4(),
                kind="doc_update_suggested",
                software_id=sw.id,
                project_id=None,
                work_order_id=wo.id,
                section_a_id=section_uuid,
                section_b_id=None,
                description=rationale[:2000],
                status="open",
                origin="auto",
                run_actor_id=run_actor_id,
                triggered_by=None,
                payload_json={"replacement_markdown": replacement},
            )
            self.db.add(issue)
            await self.db.flush()
            kept += 1
            await gs.add_edge(
                project_id=pr.id,
                source_type="work_order",
                source_id=wo.id,
                target_type="issue",
                target_id=issue.id,
                edge_type="suggests_doc_update",
            )

        return DocSyncRunResult(
            proposals_total=proposals_total,
            proposals_kept=kept,
            proposals_dropped=dropped,
        )
