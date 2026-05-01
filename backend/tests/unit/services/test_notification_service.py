"""Unit tests for NotificationService (mocked AsyncSession)."""

from __future__ import annotations

import base64
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.exceptions import ApiError
from app.models.notification import Notification
from app.services.notification_service import (
    NotificationService,
    decode_notification_cursor,
    encode_notification_cursor,
)


def test_decode_cursor_none() -> None:
    assert decode_notification_cursor(None) is None


def test_decode_cursor_invalid_base64_raises() -> None:
    with pytest.raises(ApiError) as ei:
        decode_notification_cursor("not!!!valid-base64")
    assert ei.value.status_code == 422


def test_decode_cursor_invalid_json_raises() -> None:
    bad = base64.urlsafe_b64encode(b"x").decode("ascii")
    with pytest.raises(ApiError) as ei:
        decode_notification_cursor(bad)
    assert ei.value.status_code == 422


def test_encode_decode_roundtrip() -> None:
    ts = datetime(2026, 5, 1, 12, 0, tzinfo=timezone.utc)
    nid = uuid.uuid4()
    raw = encode_notification_cursor(ts, nid)
    out = decode_notification_cursor(raw)
    assert out is not None
    assert out[0] == ts
    assert out[1] == nid


@pytest.mark.asyncio
async def test_mark_read_not_found_raises() -> None:
    db = MagicMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=result)

    with pytest.raises(ApiError) as ei:
        await NotificationService(db).mark_read(
            uuid.uuid4(), uuid.uuid4(), read=True
        )
    assert ei.value.status_code == 404
    assert ei.value.error_code == "NOT_FOUND"


@pytest.mark.asyncio
async def test_mark_read_sets_read_at() -> None:
    uid = uuid.uuid4()
    nid = uuid.uuid4()
    n = Notification(
        id=nid,
        user_id=uid,
        kind="system",
        title="t",
        body="b",
        read_at=None,
        created_at=datetime.now(timezone.utc),
    )
    db = MagicMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = n
    db.execute = AsyncMock(return_value=result)
    db.flush = AsyncMock()

    await NotificationService(db).mark_read(uid, nid, read=True)
    assert n.read_at is not None
    db.flush.assert_awaited_once()


@pytest.mark.asyncio
async def test_mark_read_clears_read_at() -> None:
    uid = uuid.uuid4()
    nid = uuid.uuid4()
    n = Notification(
        id=nid,
        user_id=uid,
        kind="system",
        title="t",
        body="b",
        read_at=datetime.now(timezone.utc),
        created_at=datetime.now(timezone.utc),
    )
    db = MagicMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = n
    db.execute = AsyncMock(return_value=result)
    db.flush = AsyncMock()

    await NotificationService(db).mark_read(uid, nid, read=False)
    assert n.read_at is None


@pytest.mark.asyncio
async def test_mark_all_read_returns_rowcount() -> None:
    uid = uuid.uuid4()
    db = MagicMock()
    exec_result = MagicMock()
    exec_result.rowcount = 3
    db.execute = AsyncMock(return_value=exec_result)
    db.flush = AsyncMock()

    n = await NotificationService(db).mark_all_read(uid)
    assert n == 3
    db.flush.assert_awaited_once()


@pytest.mark.asyncio
async def test_list_for_user_invalid_cursor_raises() -> None:
    db = MagicMock()
    with pytest.raises(ApiError) as ei:
        await NotificationService(db).list_for_user(
            uuid.uuid4(), limit=10, cursor="@@@"
        )
    assert ei.value.status_code == 422
