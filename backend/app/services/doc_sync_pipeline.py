"""Background doc sync after work order moves to done."""

from __future__ import annotations

import logging
import uuid

from app.database import async_session_factory
from app.services.doc_sync_service import DocSyncService
from app.services.llm_service import LLMService

log = logging.getLogger("atelier.doc_sync_pipeline")


async def enqueue_doc_sync_for_work_order(
    work_order_id: uuid.UUID,
    run_actor_id: uuid.UUID,
) -> None:
    """Run in a dedicated session (after request commit). Failures are logged only."""
    async with async_session_factory() as session:
        try:
            llm = LLMService(session)
            await DocSyncService(session, llm).propose_for_work_order(
                work_order_id,
                run_actor_id=run_actor_id,
            )
            await session.commit()
        except Exception:
            await session.rollback()
            log.exception(
                "doc_sync_background_failed work_order_id=%s",
                str(work_order_id),
            )
