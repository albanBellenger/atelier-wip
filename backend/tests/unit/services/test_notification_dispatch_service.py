"""Unit tests for notification dispatch (writer side)."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models.notification import Notification
from app.services.notification_dispatch_service import (
    NotificationDispatchService,
)


@pytest.mark.asyncio
async def test_insert_many_excludes_actor() -> None:
    db = MagicMock()
    db.add_all = MagicMock()
    db.flush = AsyncMock()
    a, b, c = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    n = await NotificationDispatchService(db).insert_many(
        user_ids=[a, b, c],
        kind="section_updated",
        title="T",
        body="B",
        actor_user_id=b,
    )
    assert n == 2
    added: list[Notification] = list(db.add_all.call_args[0][0])
    assert {x.user_id for x in added} == {a, c}
    db.flush.assert_awaited_once()


@pytest.mark.asyncio
async def test_insert_many_empty_when_only_actor() -> None:
    db = MagicMock()
    uid = uuid.uuid4()
    n = await NotificationDispatchService(db).insert_many(
        user_ids=[uid],
        kind="publish_commit",
        title="T",
        body="B",
        actor_user_id=uid,
    )
    assert n == 0
    db.add_all.assert_not_called()
