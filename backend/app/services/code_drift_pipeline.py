"""Background job: software-wide code drift sweep."""

from __future__ import annotations

import logging
import uuid

from app.database import async_session_factory
from app.services.code_drift_service import CodeDriftService
from app.services.llm_service import LLMService

log = logging.getLogger("atelier.code_drift_pipeline")


async def enqueue_code_drift_run(software_id: uuid.UUID, run_actor_id: uuid.UUID) -> None:
    """Run drift analysis in a dedicated session (matches codebase index pattern)."""
    async with async_session_factory() as session:
        try:
            svc = CodeDriftService(session, LLMService(session))
            await svc.run_for_software(software_id, run_actor_id)
            await session.commit()
        except Exception:
            await session.rollback()
            log.exception(
                "code_drift_run_failed",
                software_id=str(software_id),
            )
