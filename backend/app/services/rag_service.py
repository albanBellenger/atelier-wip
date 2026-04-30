"""RAG context assembly (architecture Slice 6)."""

from __future__ import annotations

import uuid

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ApiError
from app.models import Artifact, ArtifactChunk, Project, Section, SectionChunk, Software
from app.services.embedding_service import EmbeddingService

log = structlog.get_logger("atelier.rag")


class RAGService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def build_context(
        self,
        query: str,
        project_id: uuid.UUID,
        current_section_id: uuid.UUID | None,
        *,
        token_budget: int = 6000,
    ) -> str:
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

        def_block = ((software.definition or "").strip())[:2000]

        parts: list[str] = [
            "## Software definition\n" + def_block,
            "## Project outline\n" + outline,
            "## Current section\n" + current_body,
        ]

        q = (query or "").strip()
        qvec: list[float] | None = None
        if q:
            try:
                emb = EmbeddingService(self.db)
                qvec = (await emb.embed_batch([q]))[0]
            except ApiError as e:
                log.warning("rag_embed_skip", reason=str(e))

        chunks_meta: list[tuple[str, str]] = []

        if qvec is not None:
            sec_stmt = (
                select(SectionChunk, Section.title)
                .join(Section, SectionChunk.section_id == Section.id)
                .where(Section.project_id == project_id)
            )
            if current_section_id:
                sec_stmt = sec_stmt.where(
                    SectionChunk.section_id != current_section_id
                )
            sec_stmt = sec_stmt.order_by(
                SectionChunk.embedding.cosine_distance(qvec)
            ).limit(5)
            for chunk, title in (await self.db.execute(sec_stmt)).all():
                chunks_meta.append(
                    (f"section:{title}:{chunk.chunk_index}", chunk.content)
                )

            art_stmt = (
                select(ArtifactChunk, Artifact.name)
                .join(Artifact, ArtifactChunk.artifact_id == Artifact.id)
                .where(Artifact.project_id == project_id)
                .order_by(ArtifactChunk.embedding.cosine_distance(qvec))
                .limit(5)
            )
            for chunk, art_name in (await self.db.execute(art_stmt)).all():
                chunks_meta.append(
                    (f"artifact:{art_name}:{chunk.chunk_index}", chunk.content)
                )

        remaining = budget_chars - sum(len(p) for p in parts)
        rag_extra: list[str] = []
        for label, text in chunks_meta:
            block = f"### {label}\n{text.strip()}\n"
            if len(block) <= remaining:
                rag_extra.append(block)
                remaining -= len(block)
            elif remaining > 200:
                rag_extra.append(block[:remaining] + "\n")
                break
            else:
                break

        if rag_extra:
            parts.append("## Retrieved chunks\n" + "\n".join(rag_extra))

        out = "\n\n".join(parts)
        if len(out) > budget_chars:
            return out[:budget_chars] + "\n…"
        return out
