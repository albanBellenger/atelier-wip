"""LLM conflict / gap detection → Issue rows + graph edges (Slice 11)."""

from __future__ import annotations

import uuid
from typing import Any

import structlog
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ApiError
from app.models import Issue, Section
from app.schemas.token_usage_scope import TokenUsageScope
from app.services.graph_service import GraphService
from app.services.llm_service import LLMService

log = structlog.get_logger("atelier.conflict")

# ── Prompts ───────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = (
    "You analyze software specification sections for contradictions between "
    "pairs of sections and for obvious gaps within single sections.\n"
    "- pair_conflict: contradictory requirements between section_index_a and "
    "section_index_b (both indices valid).\n"
    "- section_gap: missing critical info for section_index_a only; set "
    "section_index_b to null.\n"
    "Use indices exactly as given (0-based). Be concise."
)

USER_PROMPT = "Sections catalog:\n\n{catalog}"

# ── Schemas ───────────────────────────────────────────────────────────────────

CONFLICT_ANALYSIS_SCHEMA: dict[str, Any] = {
    "name": "conflict_analysis",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "findings": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "finding_type": {
                            "type": "string",
                            "enum": ["pair_conflict", "section_gap"],
                        },
                        "section_index_a": {"type": "integer"},
                        "section_index_b": {"type": ["integer", "null"]},
                        "description": {"type": "string"},
                    },
                    "required": [
                        "finding_type",
                        "section_index_a",
                        "section_index_b",
                        "description",
                    ],
                },
            }
        },
        "required": ["findings"],
    },
}

# ── Agent ─────────────────────────────────────────────────────────────────────


class ConflictAgent:
    def __init__(self, db: AsyncSession, llm: LLMService) -> None:
        self.db = db
        self.llm = llm

    async def clear_open_auto_issues(self, project_id: uuid.UUID) -> None:
        await self.db.execute(
            delete(Issue).where(
                Issue.project_id == project_id,
                Issue.status == "open",
                Issue.origin == "auto",
            )
        )

    async def run_conflict_analysis(
        self,
        *,
        project_id: uuid.UUID,
        run_actor_id: uuid.UUID,
        origin: str,
    ) -> int:
        """Returns number of issues created."""
        software_id: uuid.UUID | None = None
        studio_id: uuid.UUID | None = None
        sec_row = await self.db.execute(
            select(Section).where(Section.project_id == project_id).order_by(Section.order)
        )
        sections = list(sec_row.scalars().all())
        if sections:
            from app.models import Project

            pr = await self.db.get(Project, project_id)
            if pr:
                from app.models import Software

                sw = await self.db.get(Software, pr.software_id)
                if sw:
                    software_id = sw.id
                    studio_id = sw.studio_id

        if not studio_id or not software_id:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Project context not found.",
            )

        await self.clear_open_auto_issues(project_id)

        if not sections:
            await self.db.flush()
            return 0

        blocks: list[str] = []
        max_body = 3200
        for i, s in enumerate(sections):
            body = (s.content or "").strip()
            if len(body) > max_body:
                body = body[:max_body] + "\n…"
            blocks.append(
                f"### Section index {i}\nTitle: {s.title}\nSlug: {s.slug}\n\n{body}\n"
            )
        catalog = "\n".join(blocks)

        ctx = TokenUsageScope(
            studio_id=studio_id,
            software_id=software_id,
            project_id=project_id,
            user_id=run_actor_id,
        )
        try:
            parsed = await self.llm.chat_structured(
                system_prompt=SYSTEM_PROMPT,
                user_prompt=USER_PROMPT.format(catalog=catalog),
                json_schema=CONFLICT_ANALYSIS_SCHEMA,
                usage_scope=ctx,
                call_type="conflict",
            )
        except ApiError as e:
            log.warning("conflict_llm_failed", code=e.error_code)
            return 0

        findings = []
        if isinstance(parsed, dict):
            findings = parsed.get("findings") or []
        if not isinstance(findings, list):
            findings = []

        graph = GraphService(self.db)
        created = 0
        n = len(sections)
        for item in findings:
            if not isinstance(item, dict):
                continue
            desc = str(item.get("description") or "").strip()
            if not desc:
                continue
            ft = item.get("finding_type")
            ia = item.get("section_index_a")
            ib = item.get("section_index_b")
            if not isinstance(ia, int) or ia < 0 or ia >= n:
                continue
            sec_a = sections[ia].id
            sec_b_uuid = None
            if ft == "pair_conflict":
                if not isinstance(ib, int) or ib < 0 or ib >= n or ib == ia:
                    continue
                sec_b_uuid = sections[ib].id

            issue = Issue(
                id=uuid.uuid4(),
                project_id=project_id,
                triggered_by=None,
                section_a_id=sec_a,
                section_b_id=sec_b_uuid,
                description=desc[:8000],
                status="open",
                origin=origin,
                run_actor_id=run_actor_id,
            )
            self.db.add(issue)
            await self.db.flush()
            await graph.add_edge(
                project_id=project_id,
                source_type="section",
                source_id=sec_a,
                target_type="issue",
                target_id=issue.id,
                edge_type="involves",
            )
            if sec_b_uuid:
                await graph.add_edge(
                    project_id=project_id,
                    source_type="section",
                    source_id=sec_b_uuid,
                    target_type="issue",
                    target_id=issue.id,
                    edge_type="involves",
                )
            created += 1

        await self.db.flush()
        return created
