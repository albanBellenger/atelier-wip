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
from app.schemas.context_preview import ContextBlockOut, ContextPreviewOut
from app.schemas.token_context import TokenContext
from app.security.field_encryption import decrypt_secret, fernet_configured
from app.services.embedding_service import EmbeddingService
from app.services import git_service as gitlab_history
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


@dataclass(frozen=True)
class _RAGAssembly:
    """Intermediate result shared by build_context and build_context_with_blocks."""

    parts: list[str]
    truncated_early: bool
    mandatory_truncated: bool
    chunks_meta: list[tuple[float, str, str]]
    token_budget: int
    budget_chars: int
    def_block: str
    rag_extra: list[str]
    outline_plain: str
    outline_trimmed: bool
    current_section_id: uuid.UUID | None


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

    async def _git_history_block(self, software: Software, *, max_chars: int) -> str:
        """Recent commits for RAG; never raises; empty string if no room."""
        header = "## Recent git history (user-requested)\n"
        if max_chars <= len(header) + 24:
            return ""
        if not (software.git_repo_url or "").strip() or not (software.git_token or "").strip():
            return header + "No git history available (repository not configured).\n"
        if not fernet_configured():
            return header + "No git history available.\n"
        try:
            plain = decrypt_secret(software.git_token)
        except Exception:
            log.warning("rag_git_token_decrypt_failed")
            return header + "No git history available.\n"
        try:
            commits = await gitlab_history.list_commits(
                repo_web_url=software.git_repo_url.strip(),
                token=plain,
                branch=(software.git_branch or "main").strip(),
                per_page=15,
            )
        except (ValueError, ApiError) as e:
            log.warning("rag_git_list_failed", err=str(e))
            return header + "No git history available.\n"
        lines: list[str] = []
        for c in commits[:15]:
            if not isinstance(c, dict):
                continue
            raw_title = c.get("title") or c.get("message") or ""
            title = str(raw_title).strip().split("\n", 1)[0][:200]
            sid = str(c.get("short_id") or (c.get("id") or ""))[:12]
            lines.append(f"- {sid}: {title}")
        body = "\n".join(lines) if lines else "(no commits returned)"
        block = header + body + "\n"
        if len(block) > max_chars:
            block = block[: max(0, max_chars - 4)] + "\n…\n"
        return block

    async def _assemble_rag_parts(
        self,
        query: str,
        project_id: uuid.UUID,
        current_section_id: uuid.UUID | None,
        *,
        token_budget: int = 6000,
        current_section_plaintext_override: str | None = None,
        include_git_history: bool = False,
    ) -> _RAGAssembly:
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
            override = (current_section_plaintext_override or "").strip()
            current_body = override if override else (cur.content or "")

        ctx = TokenContext(
            studio_id=software.studio_id,
            software_id=software.id,
            project_id=project_id,
            user_id=None,
        )

        def_block = await self._definition_block_for_rag(software, ctx)
        def_section = "## Software definition\n" + def_block
        outline_section = "## Project outline\n" + outline

        outline_trimmed = False
        mandatory_truncated = False

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
                outline_trimmed = allowed_outline < len(outline)
        else:
            current_header = "## Current section\n"
            parts, mandatory_truncated = _mandatory_parts_with_overflow(
                def_section,
                outline_section,
                current_header,
                current_body,
                budget_chars,
            )
            context_was_truncated = mandatory_truncated

        if include_git_history:
            remaining = budget_chars - sum(len(p) for p in parts)
            if remaining > 200:
                git_part = await self._git_history_block(
                    software, max_chars=min(8000, remaining - 80)
                )
                if git_part:
                    parts.append(git_part)
                    if sum(len(p) for p in parts) > budget_chars:
                        context_was_truncated = True
                        over = sum(len(p) for p in parts) - budget_chars
                        last = parts[-1]
                        parts[-1] = last[: max(0, len(last) - over - 4)] + "\n…\n"

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

        return _RAGAssembly(
            parts=parts,
            truncated_early=context_was_truncated,
            mandatory_truncated=mandatory_truncated,
            chunks_meta=chunks_meta,
            token_budget=token_budget,
            budget_chars=budget_chars,
            def_block=def_block,
            rag_extra=rag_extra,
            outline_plain=outline,
            outline_trimmed=outline_trimmed,
            current_section_id=current_section_id,
        )

    @staticmethod
    def _approx_tokens(text: str) -> int:
        return max(0, len(text) // 4)

    def _preview_blocks_from_assembly(self, asm: _RAGAssembly) -> list[ContextBlockOut]:
        parts = asm.parts
        blocks: list[ContextBlockOut] = []
        soft_def_trunc = len(asm.def_block) > SOFT_DEF_TOKEN_CAP * 4
        blocks.append(
            ContextBlockOut(
                label="Software definition",
                kind="software_def",
                body=parts[0],
                tokens=self._approx_tokens(parts[0]),
                relevance=None,
                truncated=soft_def_trunc,
            )
        )
        outline_trunc = asm.outline_trimmed
        blocks.append(
            ContextBlockOut(
                label="Project outline",
                kind="outline",
                body=parts[1],
                tokens=self._approx_tokens(parts[1]),
                relevance=None,
                truncated=outline_trunc,
            )
        )
        idx = 2
        if asm.current_section_id is not None:
            cur_body = parts[idx]
            blocks.append(
                ContextBlockOut(
                    label="Current section",
                    kind="current_section",
                    body=cur_body,
                    tokens=self._approx_tokens(cur_body),
                    relevance=None,
                    truncated=asm.mandatory_truncated,
                )
            )
            idx += 1
        while idx < len(parts) and parts[idx].startswith("## Recent git history"):
            g = parts[idx]
            blocks.append(
                ContextBlockOut(
                    label="Recent git history",
                    kind="git_history",
                    body=g,
                    tokens=self._approx_tokens(g),
                    relevance=None,
                    truncated=g.rstrip().endswith("…") or "\n…\n" in g[-6:],
                )
            )
            idx += 1
        if idx < len(parts) and parts[idx].startswith("## Retrieved chunks"):
            retrieved = parts[idx]
            blocks.append(
                ContextBlockOut(
                    label="Retrieved chunks",
                    kind="retrieved_header",
                    body=retrieved,
                    tokens=self._approx_tokens(retrieved),
                    relevance=None,
                    truncated=False,
                )
            )
            idx += 1
        return blocks

    async def build_context_with_blocks(
        self,
        query: str,
        project_id: uuid.UUID,
        current_section_id: uuid.UUID | None,
        *,
        token_budget: int = 6000,
        current_section_plaintext_override: str | None = None,
        include_git_history: bool = False,
    ) -> ContextPreviewOut:
        """Structured RAG preview; same retrieval path as :meth:`build_context`."""
        asm = await self._assemble_rag_parts(
            query,
            project_id,
            current_section_id,
            token_budget=token_budget,
            current_section_plaintext_override=current_section_plaintext_override,
            include_git_history=include_git_history,
        )
        blocks = self._preview_blocks_from_assembly(asm)
        out = "\n\n".join(asm.parts)
        overflow: str | None = None
        if len(out) > asm.budget_chars:
            overflow = "hard_character_cap"
        elif asm.truncated_early:
            overflow = "mandatory_or_git_trim"
        total_tokens = sum(b.tokens for b in blocks)
        return ContextPreviewOut(
            blocks=blocks,
            total_tokens=total_tokens,
            budget_tokens=asm.token_budget,
            overflow_strategy_applied=overflow,
        )

    async def build_context(
        self,
        query: str,
        project_id: uuid.UUID,
        current_section_id: uuid.UUID | None,
        *,
        token_budget: int = 6000,
        current_section_plaintext_override: str | None = None,
        include_git_history: bool = False,
    ) -> RAGContext:
        """Assemble labelled context string within approximate token budget."""
        asm = await self._assemble_rag_parts(
            query,
            project_id,
            current_section_id,
            token_budget=token_budget,
            current_section_plaintext_override=current_section_plaintext_override,
            include_git_history=include_git_history,
        )
        out = "\n\n".join(asm.parts)
        context_was_truncated = asm.truncated_early
        if len(out) > asm.budget_chars:
            context_was_truncated = True
            out = out[: asm.budget_chars] + "\n…"

        return RAGContext(text=out, truncated=context_was_truncated)
