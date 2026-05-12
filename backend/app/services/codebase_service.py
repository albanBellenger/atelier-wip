"""Software-linked GitLab codebase snapshots (Slice 16b)."""

from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timezone

from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.backprop_outline_agent import BackpropOutlineAgent
from app.agents.backprop_section_agent import BackpropSectionAgent
from app.config import get_settings
from app.exceptions import ApiError
from app.models import CodebaseChunk, CodebaseFile, CodebaseSnapshot, CodebaseSymbol, Section, Software
from app.schemas.codebase import CodebaseSnapshotResponse
from app.schemas.token_usage_scope import TokenUsageScope
from app.security.field_encryption import decrypt_secret, fernet_configured
from app.services.code_chunking import chunk_source, extract_symbols, should_skip_path, tree_sitter_language_key
from app.services.codebase_rag_service import CodebaseRagService
from app.services.codebase_repo_map import repo_map_lru
from app.services.embedding_service import EmbeddingService, embedding_resolvable
from app.services.embedding_token_usage_scope import usage_scope_for_software
from app.services.git_service import fetch_blob, list_commits, list_repo_tree
from app.services.llm_service import LLMService
from app.services.section_service import effective_section_plaintext

log = logging.getLogger("atelier.codebase")


class CodebaseService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_ready_snapshot(self, software_id: uuid.UUID) -> CodebaseSnapshot | None:
        q = (
            select(CodebaseSnapshot)
            .where(
                CodebaseSnapshot.software_id == software_id,
                CodebaseSnapshot.status == "ready",
            )
            .order_by(CodebaseSnapshot.ready_at.desc().nulls_last(), CodebaseSnapshot.created_at.desc())
            .limit(1)
        )
        return await self.db.scalar(q)

    def _decrypt_git_token(self, software: Software) -> str:
        if not software.git_repo_url or not software.git_branch:
            raise ApiError(
                status_code=400,
                code="GIT_NOT_CONFIGURED",
                message="Software git repository URL and branch are required.",
            )
        if not software.git_token:
            raise ApiError(
                status_code=400,
                code="GIT_NOT_CONFIGURED",
                message="Software git token is not set.",
            )
        if not fernet_configured():
            raise ApiError(
                status_code=500,
                code="ENCRYPTION_MISCONFIGURED",
                message="Server encryption key is not configured.",
            )
        plain = decrypt_secret(software.git_token)
        if not plain:
            raise ApiError(
                status_code=400,
                code="GIT_NOT_CONFIGURED",
                message="Could not read git token.",
            )
        return plain

    async def create_pending_snapshot(
        self,
        *,
        software_id: uuid.UUID,
        triggered_by_user_id: uuid.UUID | None,
    ) -> CodebaseSnapshot:
        sw = await self.db.get(Software, software_id)
        if sw is None:
            raise ApiError(status_code=404, code="NOT_FOUND", message="Software not found")
        token = self._decrypt_git_token(sw)
        if not await embedding_resolvable(self.db, sw.studio_id):
            raise ApiError(
                status_code=503,
                code="EMBEDDING_NOT_CONFIGURED",
                message="Embedding provider must be configured to index the codebase.",
            )
        commits = await list_commits(
            repo_web_url=str(sw.git_repo_url),
            token=token,
            branch=str(sw.git_branch or "main"),
            per_page=1,
        )
        head: str | None = None
        if commits and isinstance(commits[0].get("id"), str):
            head = commits[0]["id"]
        if not head:
            raise ApiError(
                status_code=502,
                code="GITLAB_ERROR",
                message="Could not resolve repository HEAD.",
            )
        snap = CodebaseSnapshot(
            software_id=software_id,
            commit_sha=head,
            branch=str(sw.git_branch or "main"),
            status="pending",
            triggered_by_user_id=triggered_by_user_id,
        )
        self.db.add(snap)
        await self.db.flush()
        return snap

    async def list_snapshots(self, software_id: uuid.UUID) -> list[CodebaseSnapshotResponse]:
        rows = (
            await self.db.scalars(
                select(CodebaseSnapshot)
                .where(CodebaseSnapshot.software_id == software_id)
                .order_by(CodebaseSnapshot.created_at.desc())
            )
        ).all()
        out: list[CodebaseSnapshotResponse] = []
        for r in rows:
            n_files = int(
                await self.db.scalar(
                    select(func.count()).select_from(CodebaseFile).where(CodebaseFile.snapshot_id == r.id)
                )
                or 0
            )
            n_chunks = int(
                await self.db.scalar(
                    select(func.count()).select_from(CodebaseChunk).where(CodebaseChunk.snapshot_id == r.id)
                )
                or 0
            )
            out.append(self._to_response(r, file_count=n_files, chunk_count=n_chunks))
        return out

    async def get_snapshot_detail(
        self, software_id: uuid.UUID, snapshot_id: uuid.UUID
    ) -> CodebaseSnapshotResponse:
        row = await self.db.get(CodebaseSnapshot, snapshot_id)
        if row is None or row.software_id != software_id:
            raise ApiError(status_code=404, code="NOT_FOUND", message="Snapshot not found")
        n_files = int(
            await self.db.scalar(
                select(func.count()).select_from(CodebaseFile).where(CodebaseFile.snapshot_id == row.id)
            )
            or 0
        )
        n_chunks = int(
            await self.db.scalar(
                select(func.count()).select_from(CodebaseChunk).where(CodebaseChunk.snapshot_id == row.id)
            )
            or 0
        )
        return self._to_response(row, file_count=n_files, chunk_count=n_chunks)

    def _to_response(
        self,
        r: CodebaseSnapshot,
        *,
        file_count: int,
        chunk_count: int,
    ) -> CodebaseSnapshotResponse:
        return CodebaseSnapshotResponse(
            id=r.id,
            software_id=r.software_id,
            commit_sha=r.commit_sha,
            branch=r.branch,
            status=r.status,
            error_message=r.error_message,
            created_at=r.created_at,
            ready_at=r.ready_at,
            file_count=file_count,
            chunk_count=chunk_count,
        )

    async def _supersede_sibling_snapshots(self, software_id: uuid.UUID, keep_id: uuid.UUID) -> None:
        """Mark other snapshots for this software as superseded; drop indexed data except for ``keep_id``."""
        prior_ready = (
            await self.db.scalars(
                select(CodebaseSnapshot).where(
                    CodebaseSnapshot.software_id == software_id,
                    CodebaseSnapshot.status == "ready",
                    CodebaseSnapshot.id != keep_id,
                )
            )
        ).all()
        for old in prior_ready:
            await self.db.execute(delete(CodebaseChunk).where(CodebaseChunk.snapshot_id == old.id))
            await self.db.execute(delete(CodebaseSymbol).where(CodebaseSymbol.snapshot_id == old.id))
            await self.db.execute(delete(CodebaseFile).where(CodebaseFile.snapshot_id == old.id))
            old.status = "superseded"

        stale_pending = (
            await self.db.scalars(
                select(CodebaseSnapshot).where(
                    CodebaseSnapshot.software_id == software_id,
                    CodebaseSnapshot.status == "pending",
                    CodebaseSnapshot.id != keep_id,
                )
            )
        ).all()
        for old in stale_pending:
            await self.db.execute(delete(CodebaseChunk).where(CodebaseChunk.snapshot_id == old.id))
            await self.db.execute(delete(CodebaseSymbol).where(CodebaseSymbol.snapshot_id == old.id))
            await self.db.execute(delete(CodebaseFile).where(CodebaseFile.snapshot_id == old.id))
            old.status = "superseded"

    async def run_index_snapshot(self, snapshot_id: uuid.UUID) -> None:
        settings = get_settings()
        snap = await self.db.get(CodebaseSnapshot, snapshot_id)
        if snap is None:
            return
        if snap.status in ("superseded", "ready"):
            return
        sw = await self.db.get(Software, snap.software_id)
        if sw is None:
            snap.status = "failed"
            snap.error_message = "Software missing"
            return

        token = self._decrypt_git_token(sw)
        snap.status = "indexing"
        snap.error_message = None
        await self.db.flush()

        try:
            tree = await list_repo_tree(
                repo_web_url=str(sw.git_repo_url),
                token=token,
                branch=snap.commit_sha,
                path="",
            )
        except Exception as e:
            snap.status = "failed"
            snap.error_message = str(e)[:2000]
            log.exception("codebase_tree_failed", snapshot_id=str(snapshot_id))
            return

        blobs = [b for b in tree if not should_skip_path(b["path"])]
        blobs.sort(key=lambda x: x["path"])
        max_files = settings.codebase_index_max_files
        max_total = settings.codebase_index_max_total_bytes
        max_file_b = settings.codebase_index_max_file_bytes

        scope = await usage_scope_for_software(self.db, sw.id)
        studio_id = scope.studio_id if scope else None
        emb = EmbeddingService(self.db)

        total_bytes = 0
        files_indexed = 0

        for b in blobs:
            if files_indexed >= max_files:
                break
            path = b["path"]
            blob_id = str(b["id"])
            try:
                raw = await fetch_blob(
                    repo_web_url=str(sw.git_repo_url),
                    token=token,
                    ref=snap.commit_sha,
                    file_path=path,
                )
            except Exception:
                continue
            if len(raw) > max_file_b:
                continue
            total_bytes += len(raw)
            if total_bytes > max_total:
                break
            try:
                text = raw.decode("utf-8")
            except UnicodeDecodeError:
                text = raw.decode("utf-8", errors="replace")
            if text.count("\ufffd") > max(10, len(text) // 50):
                continue

            lang = tree_sitter_language_key(path)
            pieces = chunk_source(path, text)
            if not pieces:
                continue

            cf = CodebaseFile(
                snapshot_id=snap.id,
                path=path,
                blob_sha=blob_id,
                size_bytes=len(raw),
                language=lang,
            )
            self.db.add(cf)
            await self.db.flush()

            for sp in extract_symbols(path, text):
                self.db.add(
                    CodebaseSymbol(
                        snapshot_id=snap.id,
                        file_id=cf.id,
                        name=sp.name,
                        kind=sp.kind,
                        start_line=sp.start_line,
                        end_line=sp.end_line,
                    )
                )

            embed_inputs = [f"{path}\n\n{p.text}" for p in pieces]
            try:
                vectors = await emb.embed_batch(
                    embed_inputs,
                    studio_id=studio_id,
                    usage_scope=scope,
                    embedding_call_source="codebase_index",
                )
            except Exception as e:
                snap.status = "failed"
                snap.error_message = str(e)[:2000]
                await self.db.flush()
                log.exception("codebase_embed_failed", snapshot_id=str(snapshot_id))
                return

            for i, (pc, vec) in enumerate(zip(pieces, vectors, strict=True)):
                self.db.add(
                    CodebaseChunk(
                        snapshot_id=snap.id,
                        file_id=cf.id,
                        chunk_index=i,
                        content=pc.text,
                        embedding=vec,
                        start_line=pc.start_line,
                        end_line=pc.end_line,
                    )
                )
            files_indexed += 1

        snap.status = "ready"
        snap.ready_at = datetime.now(timezone.utc)
        await self._supersede_sibling_snapshots(sw.id, snap.id)

    @staticmethod
    def _repo_map_blob(ranked_paths: list[str], *, max_lines: int = 60) -> str:
        lines = ranked_paths[:max_lines]
        return "\n".join(lines) if lines else "(no paths in repo map)"

    @staticmethod
    def _code_chunks_blob(
        hits: list[dict[str, object]],
        symbol_paths: list[str],
    ) -> str:
        parts: list[str] = []
        for h in hits:
            path = str(h.get("path") or "")
            snip = str(h.get("snippet") or "")
            sl = h.get("start_line")
            el = h.get("end_line")
            score = h.get("score")
            parts.append(f"=== {path} (lines {sl}-{el}) distance={score}\n{snip}\n")
        for p in symbol_paths:
            parts.append(f"{p}\n")
        return "\n".join(parts).strip() or "(no code context)"

    async def _symbol_paths_for_title_tokens(
        self, snapshot_id: uuid.UUID, title: str
    ) -> list[str]:
        tokens = [t for t in re.split(r"[^\w]+", title, flags=re.UNICODE) if len(t) >= 2][:12]
        if not tokens:
            return []
        conds = [CodebaseSymbol.name.ilike(f"%{tok}%") for tok in tokens]
        stmt = (
            select(CodebaseFile.path)
            .join(CodebaseSymbol, CodebaseSymbol.file_id == CodebaseFile.id)
            .where(
                CodebaseSymbol.snapshot_id == snapshot_id,
                or_(*conds),
            )
            .distinct()
            .limit(20)
        )
        rows = (await self.db.execute(stmt)).scalars().all()
        return [str(p) for p in rows if p]

    async def propose_software_docs_outline(
        self,
        software_id: uuid.UUID,
        hint: str | None,
        *,
        actor_user_id: uuid.UUID,
    ) -> dict[str, object]:
        sw = await self.db.get(Software, software_id)
        if sw is None:
            raise ApiError(status_code=404, code="NOT_FOUND", message="Software not found.")
        snap = await self.get_ready_snapshot(software_id)
        if snap is None:
            raise ApiError(
                status_code=409,
                code="CODEBASE_NOT_INDEXED",
                message="No ready codebase snapshot; index the codebase first.",
            )
        scope = await usage_scope_for_software(self.db, software_id)
        if scope is None:
            raise ApiError(status_code=404, code="NOT_FOUND", message="Software not found.")
        ctx = TokenUsageScope(
            studio_id=scope.studio_id,
            software_id=software_id,
            project_id=None,
            user_id=actor_user_id,
        )
        paths = list(
            (
                await self.db.scalars(
                    select(CodebaseFile.path).where(CodebaseFile.snapshot_id == snap.id)
                )
            ).all()
        )
        rm = repo_map_lru(str(snap.id), 2000, paths)
        ranked = rm.get("ranked_paths")
        if not isinstance(ranked, list):
            ranked = []
        repo_blob = self._repo_map_blob([str(p) for p in ranked], max_lines=60)
        def_block = (sw.definition or "").strip() or "(No software definition.)"
        llm = LLMService(self.db)
        parsed = await BackpropOutlineAgent(self.db, llm).propose_outline(
            ctx,
            sw_name=sw.name,
            def_block=def_block,
            repo_map_blob=repo_blob,
            hint=(hint or "").strip(),
        )
        raw_sections = parsed.get("sections")
        if not isinstance(raw_sections, list):
            raw_sections = []
        out: list[dict[str, str]] = []
        for item in raw_sections:
            if not isinstance(item, dict):
                continue
            t = str(item.get("title") or "").strip()
            s = str(item.get("slug") or "").strip()
            summ = str(item.get("summary") or "").strip()
            if not t or not s:
                continue
            out.append(
                {
                    "title": t[:512],
                    "slug": s[:256],
                    "summary": summ[:2000],
                }
            )
        return {"sections": out}

    async def propose_software_doc_section_draft(
        self,
        software_id: uuid.UUID,
        section_id: uuid.UUID,
        *,
        actor_user_id: uuid.UUID,
    ) -> dict[str, object]:
        """Draft Markdown for one Software Docs section using RAG + repo map.

        Vector search uses ``title + plaintext(content)[:1500]`` with ``limit=10``. When chunk
        hits are fewer than three, distinct file paths from ``codebase_symbols`` are added via
        case-insensitive ``ILIKE`` on title tokens (OR across tokens, cap 20); those paths are
        appended as bare lines (path only, no snippet) in the chunks blob; see
        ``BackpropSectionAgent`` module docstring for the full contract.
        """
        sw = await self.db.get(Software, software_id)
        if sw is None:
            raise ApiError(status_code=404, code="NOT_FOUND", message="Software not found.")
        sec = await self.db.get(Section, section_id)
        if sec is None or sec.software_id != software_id or sec.project_id is not None:
            raise ApiError(status_code=404, code="NOT_FOUND", message="Section not found.")
        snap = await self.get_ready_snapshot(software_id)
        if snap is None:
            raise ApiError(
                status_code=409,
                code="CODEBASE_NOT_INDEXED",
                message="No ready codebase snapshot; index the codebase first.",
            )
        scope = await usage_scope_for_software(self.db, software_id)
        if scope is None:
            raise ApiError(status_code=404, code="NOT_FOUND", message="Software not found.")
        ctx = TokenUsageScope(
            studio_id=scope.studio_id,
            software_id=software_id,
            project_id=None,
            user_id=actor_user_id,
        )
        paths = list(
            (
                await self.db.scalars(
                    select(CodebaseFile.path).where(CodebaseFile.snapshot_id == snap.id)
                )
            ).all()
        )
        rm = repo_map_lru(str(snap.id), 1500, paths)
        ranked = rm.get("ranked_paths")
        if not isinstance(ranked, list):
            ranked = []
        repo_blob = self._repo_map_blob([str(p) for p in ranked], max_lines=60)
        plain = effective_section_plaintext(sec.content, sec.yjs_state) or ""
        query_text = f"{sec.title} {plain[:1500]}".strip()
        rag = CodebaseRagService(self.db)
        hits = await rag.retrieve_chunks_for_text(
            snapshot_id=snap.id,
            software_id=software_id,
            query_text=query_text,
            limit=10,
        )
        symbol_paths: list[str] = []
        if len(hits) < 3:
            symbol_paths = await self._symbol_paths_for_title_tokens(snap.id, sec.title)
        chunks_blob = self._code_chunks_blob(hits, symbol_paths)
        def_block = (sw.definition or "").strip() or "(No software definition.)"
        summary = plain[:4000] if plain else ""
        llm = LLMService(self.db)
        parsed = await BackpropSectionAgent(self.db, llm).propose_section(
            ctx,
            sw_name=sw.name,
            def_block=def_block,
            section_title=sec.title,
            section_summary=summary,
            repo_map_blob=repo_blob,
            code_chunks_blob=chunks_blob,
        )
        md = parsed.get("markdown")
        sf = parsed.get("source_files")
        markdown = str(md).strip() if md is not None else ""
        source_files: list[str] = []
        if isinstance(sf, list):
            for x in sf:
                if isinstance(x, str) and x.strip():
                    source_files.append(x.strip())
        return {"markdown": markdown, "source_files": source_files}
