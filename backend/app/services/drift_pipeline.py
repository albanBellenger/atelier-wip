"""Debounced background drift checks after section content changes."""

from __future__ import annotations

import asyncio
import os
import uuid

import structlog

from app.agents.drift_agent import DriftAgent
from app.database import async_session_factory
from app.exceptions import ApiError
from app.services.llm_service import LLMService

log = structlog.get_logger("atelier.drift_pipeline")


def _drift_concurrency_limit() -> int:
    raw = os.environ.get("DRIFT_CONCURRENCY", "3")
    try:
        n = int(raw)
    except ValueError:
        return 3
    return max(1, n)


_DRIFT_DEBOUNCE_S = 5.0
_DRIFT_CONCURRENCY = _drift_concurrency_limit()
_drift_semaphore = asyncio.Semaphore(_DRIFT_CONCURRENCY)
_pending_drift: dict[uuid.UUID, asyncio.Task[None]] = {}


def _retry_after_hint(exc: ApiError) -> str | None:
    hdrs = getattr(exc, "headers", None)
    if not hdrs:
        return None
    v = hdrs.get("Retry-After") or hdrs.get("retry-after")
    return str(v) if v is not None else None


async def _run_drift_after_quiet(section_id: uuid.UUID) -> None:
    task = asyncio.current_task()
    try:
        await asyncio.sleep(_DRIFT_DEBOUNCE_S)
        async with _drift_semaphore:
            await enqueue_drift_check(section_id)
    except asyncio.CancelledError:
        return
    finally:
        if task is not None and _pending_drift.get(section_id) is task:
            _pending_drift.pop(section_id, None)


async def enqueue_drift_check(section_id: uuid.UUID) -> None:
    async with async_session_factory() as session:
        try:
            llm = LLMService(session)
            await DriftAgent(session, llm).run_after_section_change(section_id)
            await session.commit()
        except ApiError as e:
            await session.rollback()
            if e.status_code == 429:
                log.warning(
                    "drift_check_rate_limited",
                    section_id=str(section_id),
                    retry_after=_retry_after_hint(e),
                )
                raise
            log.exception("drift_check_failed", section_id=str(section_id))
        except Exception:
            await session.rollback()
            log.exception("drift_check_failed", section_id=str(section_id))


def schedule_drift_check(section_id: uuid.UUID) -> None:
    """Schedule drift detection ~5s after the last call for this section (quiet period)."""
    prev = _pending_drift.get(section_id)
    if prev is not None and not prev.done():
        prev.cancel()
    _pending_drift[section_id] = asyncio.create_task(_run_drift_after_quiet(section_id))
