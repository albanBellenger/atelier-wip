"""Vector retrieval over indexed codebase chunks (Slice 16c)."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ApiError
from app.models import CodebaseChunk, CodebaseFile
from app.services.embedding_service import EmbeddingService
from app.services.embedding_token_usage_scope import usage_scope_for_software


class CodebaseRagService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def retrieve_chunks_for_text(
        self,
        *,
        snapshot_id: uuid.UUID,
        software_id: uuid.UUID,
        query_text: str,
        limit: int = 12,
    ) -> list[dict[str, object]]:
        q = (query_text or "").strip()
        if not q:
            return []
        scope = await usage_scope_for_software(self.db, software_id)
        studio_id = scope.studio_id if scope else None
        emb = EmbeddingService(self.db)
        try:
            qvec = (
                await emb.embed_batch(
                    [q[:8000]],
                    studio_id=studio_id,
                    usage_scope=scope,
                    embedding_call_source="codebase_rag",
                )
            )[0]
        except ApiError:
            return []

        dist = CodebaseChunk.embedding.cosine_distance(qvec)
        stmt = (
            select(CodebaseChunk, CodebaseFile.path, dist.label("d"))
            .join(CodebaseFile, CodebaseChunk.file_id == CodebaseFile.id)
            .where(CodebaseChunk.snapshot_id == snapshot_id)
            .order_by(dist)
            .limit(max(1, min(limit, 24)))
        )
        rows = (await self.db.execute(stmt)).all()
        hits: list[dict[str, object]] = []
        for chunk, path, d in rows:
            hits.append(
                {
                    "path": path,
                    "chunk_index": chunk.chunk_index,
                    "score": float(d),
                    "snippet": chunk.content[:500],
                    "start_line": chunk.start_line,
                    "end_line": chunk.end_line,
                }
            )
        return hits

    async def retrieve_chunks(
        self,
        *,
        snapshot_id: uuid.UUID,
        software_id: uuid.UUID,
        query_embedding: list[float],
        limit: int = 12,
    ) -> list[dict[str, object]]:
        qvec = query_embedding
        dist = CodebaseChunk.embedding.cosine_distance(qvec)
        stmt = (
            select(CodebaseChunk, CodebaseFile.path, dist.label("d"))
            .join(CodebaseFile, CodebaseChunk.file_id == CodebaseFile.id)
            .where(CodebaseChunk.snapshot_id == snapshot_id)
            .order_by(dist)
            .limit(max(1, min(limit, 24)))
        )
        rows = (await self.db.execute(stmt)).all()
        hits: list[dict[str, object]] = []
        for chunk, path, d in rows:
            hits.append(
                {
                    "path": path,
                    "chunk_index": chunk.chunk_index,
                    "score": float(d),
                    "snippet": chunk.content[:500],
                    "start_line": chunk.start_line,
                    "end_line": chunk.end_line,
                }
            )
        return hits
