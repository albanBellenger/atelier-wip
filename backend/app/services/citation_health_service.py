"""LLM-backed citation coverage for specification sections."""

from __future__ import annotations

import uuid
from typing import Any

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ApiError
from app.models import Software
from app.models.project import Project, Section
from app.schemas.citation_health import CitationHealthOut, CitationMissingItemOut
from app.schemas.token_context import TokenContext
from app.services.llm_service import LLMService
from app.services.section_service import effective_section_plaintext

log = structlog.get_logger("atelier.citation_health")

CITATION_HEALTH_SCHEMA: dict[str, Any] = {
    "name": "citation_health",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "citations_resolved": {"type": "integer"},
            "citations_missing": {"type": "integer"},
            "missing_items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "statement": {"type": "string"},
                    },
                    "required": ["statement"],
                },
            },
        },
        "required": ["citations_resolved", "citations_missing", "missing_items"],
    },
}


class CitationHealthService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def analyze_section(
        self,
        *,
        project_id: uuid.UUID,
        section_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> CitationHealthOut:
        sec = await self.db.get(Section, section_id)
        if sec is None or sec.project_id != project_id:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Section not found",
            )
        text = effective_section_plaintext(sec.content, sec.yjs_state).strip()
        if not text:
            return CitationHealthOut(
                citations_resolved=0,
                citations_missing=0,
                missing_items=[],
            )

        proj = await self.db.get(Project, project_id)
        if proj is None:
            raise ApiError(status_code=404, code="NOT_FOUND", message="Project not found")
        software = await self.db.get(Software, proj.software_id)
        if software is None:
            raise ApiError(status_code=404, code="NOT_FOUND", message="Software not found")

        ctx = TokenContext(
            studio_id=software.studio_id,
            software_id=software.id,
            project_id=project_id,
            user_id=user_id,
        )
        llm = LLMService(self.db)
        await llm.ensure_openai_llm_ready()
        user_prompt = (
            "Analyze the following specification markdown. Count statements that are "
            "grounded with explicit traceability (e.g. links to work orders, artifacts, "
            "other sections, or clear normative references) as citations_resolved. "
            "Count normative or data claims that lack any traceable source as "
            "citations_missing, and list up to 12 of the most important missing items "
            "with short statement text.\n\n---\n\n"
            f"{text[:24_000]}"
        )
        raw = await llm.chat_structured(
            system_prompt=(
                "You audit specification citations. Be conservative: only count "
                "resolved when a claim clearly ties to a named source. Do not invent "
                "sources. Output strictly follows the JSON schema."
            ),
            user_prompt=user_prompt,
            json_schema=CITATION_HEALTH_SCHEMA,
            context=ctx,
            call_type="citation_health",
        )
        if not isinstance(raw, dict):
            raise ApiError(
                status_code=502,
                code="LLM_INVALID",
                message="Citation health returned non-object",
            )
        try:
            resolved = int(raw.get("citations_resolved", 0))
            missing = int(raw.get("citations_missing", 0))
        except (TypeError, ValueError):
            resolved, missing = 0, 0
        resolved = max(0, resolved)
        missing = max(0, missing)
        items_raw = raw.get("missing_items")
        items: list[CitationMissingItemOut] = []
        if isinstance(items_raw, list):
            for it in items_raw[:24]:
                if isinstance(it, dict) and isinstance(it.get("statement"), str):
                    st = it["statement"].strip()
                    if st:
                        items.append(CitationMissingItemOut(statement=st))
        return CitationHealthOut(
            citations_resolved=resolved,
            citations_missing=missing,
            missing_items=items,
        )
