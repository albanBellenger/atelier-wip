"""Debounced background drift checks after section content changes."""

from __future__ import annotations

import asyncio
import uuid

import structlog

from app.database import async_session_factory
from app.services.drift_service import DriftService

log = structlog.get_logger("atelier.drift_pipeline")

_DRIFT_DEBOUNCE_S = 5.0
_pending_drift: dict[uuid.UUID, asyncio.Task[None]] = {}


async def _run_drift_after_quiet(section_id: uuid.UUID) -> None:
    task = asyncio.current_task()
    try:
        await asyncio.sleep(_DRIFT_DEBOUNCE_S)
        await enqueue_drift_check(section_id)
    except asyncio.CancelledError:
        return
    finally:
        if task is not None and _pending_drift.get(section_id) is task:
            _pending_drift.pop(section_id, None)


async def enqueue_drift_check(section_id: uuid.UUID) -> None:
    async with async_session_factory() as session:
        try:
            await DriftService(session).run_after_section_change(section_id)
            await session.commit()
        except Exception:
            await session.rollback()
            log.exception("drift_check_failed", section_id=str(section_id))


def schedule_drift_check(section_id: uuid.UUID) -> None:
    """Schedule drift detection ~5s after the last call for this section (quiet period)."""
    prev = _pending_drift.get(section_id)
    if prev is not None and not prev.done():
        prev.cancel()
    _pending_drift[section_id] = asyncio.create_task(_run_drift_after_quiet(section_id))
