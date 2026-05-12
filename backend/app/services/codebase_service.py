"""Software-linked GitLab codebase snapshots (Slice 16b)."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.exceptions import ApiError
from app.models import CodebaseChunk, CodebaseFile, CodebaseSnapshot, CodebaseSymbol, Software
from app.schemas.codebase import CodebaseSnapshotResponse
from app.security.field_encryption import decrypt_secret, fernet_configured
from app.services.code_chunking import chunk_source, extract_symbols, should_skip_path, tree_sitter_language_key
from app.services.embedding_service import EmbeddingService, embedding_resolvable
from app.services.embedding_token_usage_scope import usage_scope_for_software
from app.services.git_service import fetch_blob, list_commits, list_repo_tree

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
