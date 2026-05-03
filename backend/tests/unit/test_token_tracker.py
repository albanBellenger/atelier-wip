"""Unit tests for token_tracker.record_usage."""

import uuid
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.schemas.token_context import TokenContext
from app.services.token_tracker import record_usage


@pytest.mark.asyncio
async def test_record_usage_openai_provider_adds_row_and_flushes() -> None:
    session = MagicMock()
    session.flush = AsyncMock()
    uid = uuid.uuid4()
    sid = uuid.uuid4()
    ctx = TokenContext(
        studio_id=sid,
        software_id=None,
        project_id=None,
        work_order_id=None,
        user_id=uid,
    )
    with patch(
        "app.services.token_tracker.estimate_cost_usd_openai",
        return_value=Decimal("0.001234"),
    ) as est:
        await record_usage(
            session,
            ctx,
            call_type="chat",
            model="gpt-4o-mini",
            input_tokens=100,
            output_tokens=50,
            provider="openai",
        )
        est.assert_called_once_with("gpt-4o-mini", 100, 50)

    session.add.assert_called_once()
    added = session.add.call_args[0][0]
    assert added.studio_id == sid
    assert added.user_id == uid
    assert added.call_type == "chat"
    assert added.model == "gpt-4o-mini"
    assert added.input_tokens == 100
    assert added.output_tokens == 50
    assert added.estimated_cost_usd == Decimal("0.001234")
    session.flush.assert_awaited_once()


@pytest.mark.asyncio
async def test_record_usage_non_openai_provider_still_estimates() -> None:
    session = MagicMock()
    session.flush = AsyncMock()
    ctx = TokenContext(studio_id=uuid.uuid4(), user_id=uuid.uuid4())
    with patch(
        "app.services.token_tracker.estimate_cost_usd_openai",
        return_value=Decimal("0.01"),
    ):
        await record_usage(
            session,
            ctx,
            call_type="thread",
            model="some-model",
            input_tokens=1,
            output_tokens=2,
            provider="other",
        )
    session.add.assert_called_once()
    session.flush.assert_awaited_once()


@pytest.mark.asyncio
async def test_record_usage_truncates_call_type_and_model() -> None:
    session = MagicMock()
    session.flush = AsyncMock()
    ctx = TokenContext(studio_id=uuid.uuid4(), user_id=uuid.uuid4())
    long_type = "x" * 64
    long_model = "m" * 300
    with patch(
        "app.services.token_tracker.estimate_cost_usd_openai",
        return_value=Decimal("0"),
    ):
        await record_usage(
            session,
            ctx,
            call_type=long_type,
            model=long_model,
            input_tokens=0,
            output_tokens=0,
        )
    row = session.add.call_args[0][0]
    assert len(row.call_type) == 32
    assert len(row.model) == 256
