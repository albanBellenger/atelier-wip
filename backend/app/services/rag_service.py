"""RAG context assembly (architecture Slice 6)."""

from __future__ import annotations

import hashlib
import uuid
from dataclasses import dataclass
from typing import Any

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ApiError
from app.models import Artifact, ArtifactChunk, Project, Section, SectionChunk, Software
from app.schemas.token_context import TokenContext
from app.services.embedding_service import EmbeddingService
from app.services.llm_service import LLMService

log = structlog.get_logger("atelier.rag")

SOFT_DEF_TOKEN_CAP = 500

SOFTWARE_DEF_SUMMARY_SCHEMA: dict[str, Any] = {
    "name": "software_def_summary",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {"summary": {"type": "string"}},
        "required": ["summary"],
    },
}


@dataclass(frozen=True)
class RAGContext:
    text: str
    truncated: bool  # True when mandatory block exceeded the budget and was adjusted


def _unified_chunk_fill(
    chunks_meta: list[tuple[float, str, str]],
    budget_chars: int,
    base_parts: list[str],
) -> list[str]:
    """Greedy fill by ascending distance. Returns list of chunk block strings (no sort side effects)."""
    remaining = max(0, budget_chars - sum(len(p) for p in base_parts))
    ordered = sorted(chunks_meta, key=lambda t: t[0])
    rag_extra: list[str] = []
    for _d, label, text in ordered:
        block = f"### {label}\n{text.strip()}\n"
        if len(block) <= remaining:
            rag_extra.append(block)
            remaining -= len(block)
        elif remaining > 200:
            rag_extra.append(block[:remaining] + "\n")
            break
        else:
            break
    return rag_extra


def _mandatory_parts_with_overflow(
    def_section: str,
    outline_section: str,
    current_header: str,
    current_body: str,
    budget_chars: int,
) -> tuple[list[str], bool]:
    """
    If mandatory text exceeds budget, truncate current_body with a 20% prefix floor.
    """
    current_part = current_header + current_body
    parts: list[str] = [def_section, outline_section, current_part]
    if sum(len(p) for p in parts) <= budget_chars:
        return parts, False
    floor = max(1, len(current_body) // 5)
    allowed = budget_chars - len(parts[0]) - len(parts[1])
    allowed = max(floor, allowed)
    new_body = current_body[:allowed]
    parts[2] = current_header + new_body
    return parts, True


class RAGService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self._software_def_summary_cache: dict[tuple[uuid.UUID, str], str] = {}

    async def _definition_block_for_rag(
        self,
        software: Software,
        ctx: TokenContext,
    ) -> str:
        raw = (software.definition or "").strip()
        soft_def_char_cap = SOFT_DEF_TOKEN_CAP * 4
        if len(raw) <= soft_def_char_cap:
            return raw
        digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
        key = (software.id, digest)
        if key in self._software_def_summary_cache:
            return self._software_def_summary_cache[key]
        llm = LLMService(self.db)
        try:
            result = await llm.chat_structured(
                system_prompt=(
                    "Summarize the software definition for use as RAG context. "
                    "Preserve technical intent, constraints, and terminology. "
                    "Be concise but do not invent facts."
                ),
                user_prompt=raw,
                json_schema=SOFTWARE_DEF_SUMMARY_SCHEMA,
                context=ctx,
                call_type="rag_software_definition_summary",
            )
        except ApiError as e:
            log.warning("rag_def_summary_llm_failed", code=e.error_code)
            summary = raw[:soft_def_char_cap]
            self._software_def_summary_cache[key] = summary
            return summary
        summary = ""
        if isinstance(result, dict):
            summary = str(result.get("summary") or "").strip()
        if not summary:
            summary = raw[:soft_def_char_cap]
        self._software_def_summary_cache[key] = summary
        return summary

    async def build_context(
        self,
        query: str,
        project_id: uuid.UUID,
        current_section_id: uuid.UUID | None,
        *,
        token_budget: int = 6000,
    ) -> RAGContext:
        """Assemble labelled context string within approximate token budget."""
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

        budget_chars = max(500, token_budget * 4)

        section_rows = (
            (
                await self.db.execute(
                    select(Section)
                    .where(Section.project_id == project_id)
                    .order_by(Section.order)
                )
            )
            .scalars()
            .all()
        )

        outline = "\n".join(f"- {s.title} ({s.slug})" for s in section_rows)

        current_body = ""
        if current_section_id:
            cur = await self.db.get(Section, current_section_id)
            if cur is None or cur.project_id != project_id:
                raise ApiError(
                    status_code=404,
                    code="NOT_FOUND",
                    message="Section not found.",
                )
            current_body = cur.content or ""

        ctx = TokenContext(
            studio_id=software.studio_id,
            software_id=software.id,
            project_id=project_id,
            user_id=None,
        )

        def_block = await self._definition_block_for_rag(software, ctx)
        def_section = "## Software definition\n" + def_block
        outline_section = "## Project outline\n" + outline

        # Project-wide chat (Slice 10): no single "current section" — outline + RAG only.
        if current_section_id is None:
            parts = [def_section, outline_section]
            context_was_truncated = False
            total = sum(len(p) for p in parts)
            if total > budget_chars:
                allowed_outline = max(0, budget_chars - len(parts[0]) - 32)
                parts[1] = "## Project outline\n" + outline[:allowed_outline] + (
                    "\n…" if allowed_outline < len(outline) else ""
                )
                context_was_truncated = True
        else:
            current_header = "## Current section\n"
            parts, context_was_truncated = _mandatory_parts_with_overflow(
                def_section,
                outline_section,
                current_header,
                current_body,
                budget_chars,
            )

        q = (query or "").strip()
        qvec: list[float] | None = None
        if q:
            try:
                emb = EmbeddingService(self.db)
                qvec = (await emb.embed_batch([q]))[0]
            except ApiError as e:
                log.warning("rag_embed_skip", reason=str(e))

        chunks_meta: list[tuple[float, str, str]] = []

        if qvec is not None:
            d_sec = SectionChunk.embedding.cosine_distance(qvec)
            sec_stmt = (
                select(SectionChunk, Section.title, d_sec.label("d"))
                .join(Section, SectionChunk.section_id == Section.id)
                .where(Section.project_id == project_id)
            )
            if current_section_id:
                sec_stmt = sec_stmt.where(
                    SectionChunk.section_id != current_section_id
                )
            sec_stmt = sec_stmt.order_by(d_sec).limit(5)
            for chunk, title, d in (await self.db.execute(sec_stmt)).all():
                chunks_meta.append(
                    (float(d), f"section:{title}:{chunk.chunk_index}", chunk.content)
                )

            d_art = ArtifactChunk.embedding.cosine_distance(qvec)
            art_stmt = (
                select(ArtifactChunk, Artifact.name, d_art.label("d"))
                .join(Artifact, ArtifactChunk.artifact_id == Artifact.id)
                .where(Artifact.project_id == project_id)
                .order_by(d_art)
                .limit(5)
            )
            for chunk, art_name, d in (await self.db.execute(art_stmt)).all():
                chunks_meta.append(
                    (float(d), f"artifact:{art_name}:{chunk.chunk_index}", chunk.content)
                )

        rag_extra = _unified_chunk_fill(chunks_meta, budget_chars, parts)

        if rag_extra:
            parts.append("## Retrieved chunks\n" + "\n".join(rag_extra))

        out = "\n\n".join(parts)
        if len(out) > budget_chars:
            context_was_truncated = True
            out = out[:budget_chars] + "\n…"

        return RAGContext(text=out, truncated=context_was_truncated)
