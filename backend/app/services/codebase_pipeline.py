"""Background jobs for codebase snapshot indexing."""

from __future__ import annotations

import asyncio
import logging
import uuid

from sqlalchemy import delete

from app.database import async_session_factory
from app.models import CodebaseChunk, CodebaseFile, CodebaseSnapshot, CodebaseSymbol
from app.services.codebase_service import CodebaseService

log = logging.getLogger("atelier.codebase_pipeline")


async def enqueue_codebase_index(snapshot_id: uuid.UUID) -> None:
    """Run indexing in a dedicated session (matches embedding pipeline pattern)."""
    async with async_session_factory() as session:
        try:
            svc = CodebaseService(session)
            await svc.run_index_snapshot(snapshot_id)
            await session.commit()
        except Exception:
            await session.rollback()
            log.exception("codebase_index_failed", snapshot_id=str(snapshot_id))
            async with async_session_factory() as err_sess:
                snap = await err_sess.get(CodebaseSnapshot, snapshot_id)
                if snap is not None:
                    snap.status = "failed"
                    snap.error_message = "Indexing failed"
                    await err_sess.commit()


def schedule_codebase_index(snapshot_id: uuid.UUID) -> None:
    asyncio.create_task(enqueue_codebase_index(snapshot_id))


async def purge_snapshot_storage(snapshot_id: uuid.UUID) -> None:
    """Remove chunks/symbols/files for a snapshot (snapshot row kept)."""
    async with async_session_factory() as session:
        await session.execute(delete(CodebaseChunk).where(CodebaseChunk.snapshot_id == snapshot_id))
        await session.execute(delete(CodebaseSymbol).where(CodebaseSymbol.snapshot_id == snapshot_id))
        await session.execute(delete(CodebaseFile).where(CodebaseFile.snapshot_id == snapshot_id))
        await session.commit()
