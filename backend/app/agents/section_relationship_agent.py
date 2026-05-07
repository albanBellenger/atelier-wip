"""LLM-detected directed section references → graph_edges (references)."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ApiError
from app.models import Section
from app.schemas.token_context import TokenContext
from app.services.graph_service import GraphService
from app.services.llm_service import LLMService

# ── Prompts ───────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = (
    "Identify explicit cross-references between specification sections "
    "(dependencies, mentions of another section by name or concept). "
    "Return directed edges from_index → to_index using the indices given. "
    "Only include clear references; omit speculative links."
)

USER_PROMPT = "Sections:\n\n{catalog}"

# ── Schemas ───────────────────────────────────────────────────────────────────

SECTION_REFS_JSON_SCHEMA: dict[str, Any] = {
    "name": "section_refs",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "links": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "from_index": {"type": "integer"},
                        "to_index": {"type": "integer"},
                    },
                    "required": ["from_index", "to_index"],
                },
            }
        },
        "required": ["links"],
    },
}

# ── Agent ─────────────────────────────────────────────────────────────────────


class SectionRelationshipAgent:
    def __init__(self, db: AsyncSession, llm: LLMService) -> None:
        self.db = db
        self.llm = llm

    async def detect_section_relationships(
        self,
        project_id: uuid.UUID,
        *,
        context_user_id: uuid.UUID,
    ) -> None:
        """LLM-detected directed section references → graph_edges (references)."""
        from app.models import Project, Software

        sec_row = await self.db.execute(
            select(Section).where(Section.project_id == project_id).order_by(Section.order)
        )
        sections = list(sec_row.scalars().all())
        if len(sections) < 2:
            return

        pr = await self.db.get(Project, project_id)
        if pr is None:
            return
        sw = await self.db.get(Software, pr.software_id)
        if sw is None:
            return

        ctx = TokenContext(
            studio_id=sw.studio_id,
            software_id=sw.id,
            project_id=project_id,
            user_id=context_user_id,
        )

        blocks: list[str] = []
        cap = 2400
        for i, s in enumerate(sections):
            body = (s.content or "").strip()
            if len(body) > cap:
                body = body[:cap] + "\n…"
            blocks.append(f"### Index {i}: {s.title}\n{body}\n")

        catalog = "\n".join(blocks)
        graph = GraphService(self.db)
        try:
            parsed = await self.llm.chat_structured(
                system_prompt=SYSTEM_PROMPT,
                user_prompt=USER_PROMPT.format(catalog=catalog),
                json_schema=SECTION_REFS_JSON_SCHEMA,
                context=ctx,
                call_type="graph",
            )
        except ApiError:
            return

        links = []
        if isinstance(parsed, dict):
            links = parsed.get("links") or []
        if not isinstance(links, list):
            return

        n = len(sections)
        for item in links:
            if not isinstance(item, dict):
                continue
            a = item.get("from_index")
            b = item.get("to_index")
            if not isinstance(a, int) or not isinstance(b, int):
                continue
            if a < 0 or a >= n or b < 0 or b >= n or a == b:
                continue
            sid_a = sections[a].id
            sid_b = sections[b].id
            await graph.add_edge(
                project_id=project_id,
                source_type="section",
                source_id=sid_a,
                target_type="section",
                target_id=sid_b,
                edge_type="references",
            )
        await self.db.flush()
