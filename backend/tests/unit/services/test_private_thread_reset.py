"""Unit: PrivateThreadService.reset_thread deletes the thread row."""

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import PrivateThread
from app.services.private_thread_service import PrivateThreadService


@pytest.mark.asyncio
async def test_reset_thread_deletes_existing_thread() -> None:
    uid = uuid.uuid4()
    sid = uuid.uuid4()
    tid = uuid.uuid4()
    th = PrivateThread(id=tid, user_id=uid, section_id=sid)

    class _Result:
        def scalar_one_or_none(self) -> PrivateThread:
            return th

    session = MagicMock(spec=AsyncSession)
    session.execute = AsyncMock(return_value=_Result())
    session.delete = AsyncMock()
    session.flush = AsyncMock()

    svc = PrivateThreadService(session)
    await svc.reset_thread(user_id=uid, section_id=sid)

    session.delete.assert_awaited_once_with(th)
    session.flush.assert_awaited_once()


@pytest.mark.asyncio
async def test_reset_thread_noop_when_missing() -> None:
    uid = uuid.uuid4()
    sid = uuid.uuid4()

    class _Empty:
        def scalar_one_or_none(self) -> None:
            return None

    session = MagicMock(spec=AsyncSession)
    session.execute = AsyncMock(return_value=_Empty())
    session.delete = AsyncMock()

    svc = PrivateThreadService(session)
    await svc.reset_thread(user_id=uid, section_id=sid)

    session.delete.assert_not_called()
