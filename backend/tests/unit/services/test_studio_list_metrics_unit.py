"""Unit tests for studio list aggregate counts."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.studio_list_metrics import aggregate_studio_card_counts


@pytest.mark.asyncio
async def test_aggregate_studio_card_counts_empty_ids() -> None:
    db = MagicMock()
    db.execute = AsyncMock()
    sw, pr, mem = await aggregate_studio_card_counts(db, [])
    assert sw == pr == mem == {}
    db.execute.assert_not_called()


@pytest.mark.asyncio
async def test_aggregate_studio_card_counts_maps_rows() -> None:
    sid1 = uuid.uuid4()
    sid2 = uuid.uuid4()
    db = MagicMock()

    def make_result(rows):
        r = MagicMock()
        r.all.return_value = rows
        return r

    db.execute = AsyncMock(
        side_effect=[
            make_result([(sid1, 2), (sid2, 1)]),
            make_result([(sid1, 5)]),
            make_result([(sid2, 3)]),
        ]
    )

    sw, pr, mem = await aggregate_studio_card_counts(db, [sid1, sid2])
    assert sw[sid1] == 2 and sw[sid2] == 1
    assert pr[sid1] == 5 and sid2 not in pr
    assert mem[sid2] == 3 and sid1 not in mem
    assert db.execute.await_count == 3
