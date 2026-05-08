"""Unit tests for token usage query service."""

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.schemas.token_usage_report import TokenUsageTotalsOut
from app.services.token_usage_query_service import TokenUsageQueryService


@pytest.mark.asyncio
async def test_totals_for_filtered_empty_db_cost_is_zero_decimal() -> None:
    """Totals never yield None cost for Pydantic totals row."""
    session = MagicMock()
    exec_result = MagicMock()
    exec_result.one.return_value = (0, 0, None)
    session.execute = AsyncMock(return_value=exec_result)

    svc = TokenUsageQueryService(session)
    tin, tout, cost = await svc.totals_for_filtered(
        scope="platform_admin",
        scope_studio_id=None,
        scope_user_id=None,
        studio_ids=None,
        software_ids=None,
        project_ids=None,
        user_ids=None,
        call_sources=["mcp"],
        work_order_ids=None,
        date_from=None,
        date_to=None,
    )

    assert cost == Decimal("0")
    totals = TokenUsageTotalsOut(
        input_tokens=tin,
        output_tokens=tout,
        estimated_cost_usd=cost,
    )
    assert totals.estimated_cost_usd == Decimal("0")


@pytest.mark.asyncio
async def test_totals_for_filtered_preserves_non_none_cost() -> None:
    session = MagicMock()
    exec_result = MagicMock()
    exec_result.one.return_value = (1, 2, Decimal("1.5"))
    session.execute = AsyncMock(return_value=exec_result)

    svc = TokenUsageQueryService(session)
    _, _, cost = await svc.totals_for_filtered(
        scope="studio",
        scope_studio_id=uuid.uuid4(),
        scope_user_id=None,
        studio_ids=None,
        software_ids=None,
        project_ids=None,
        user_ids=None,
        call_sources=None,
        work_order_ids=None,
        date_from=None,
        date_to=None,
    )
    assert cost == Decimal("1.5")


@pytest.mark.asyncio
async def test_totals_for_filtered_scope_self_and_dates() -> None:
    session = MagicMock()
    exec_result = MagicMock()
    exec_result.one.return_value = (0, 0, None)
    session.execute = AsyncMock(return_value=exec_result)
    uid = uuid.uuid4()

    svc = TokenUsageQueryService(session)
    await svc.totals_for_filtered(
        scope="self",
        scope_studio_id=None,
        scope_user_id=uid,
        studio_ids=[uuid.uuid4()],
        software_ids=[uuid.uuid4()],
        project_ids=[uuid.uuid4()],
        user_ids=[uuid.uuid4()],
        call_sources=["chat", "thread"],
        work_order_ids=[uuid.uuid4()],
        date_from=date(2026, 1, 1),
        date_to=date(2026, 1, 31),
    )
    session.execute.assert_awaited_once()


@pytest.mark.asyncio
async def test_totals_for_filtered_single_call_source_branch() -> None:
    session = MagicMock()
    exec_result = MagicMock()
    exec_result.one.return_value = (0, 0, None)
    session.execute = AsyncMock(return_value=exec_result)

    svc = TokenUsageQueryService(session)
    await svc.totals_for_filtered(
        scope="platform_admin",
        scope_studio_id=None,
        scope_user_id=None,
        studio_ids=None,
        software_ids=None,
        project_ids=None,
        user_ids=None,
        call_sources=["  chat  "],
        work_order_ids=None,
        date_from=None,
        date_to=None,
    )
    session.execute.assert_awaited_once()


@pytest.mark.asyncio
async def test_totals_for_filtered_empty_call_sources_list_no_filter() -> None:
    session = MagicMock()
    exec_result = MagicMock()
    exec_result.one.return_value = (0, 0, None)
    session.execute = AsyncMock(return_value=exec_result)

    svc = TokenUsageQueryService(session)
    await svc.totals_for_filtered(
        scope="platform_admin",
        scope_studio_id=None,
        scope_user_id=None,
        studio_ids=None,
        software_ids=None,
        project_ids=None,
        user_ids=None,
        call_sources=[],
        work_order_ids=None,
        date_from=None,
        date_to=None,
    )


@pytest.mark.asyncio
async def test_list_rows_returns_rows_and_totals() -> None:
    uid = uuid.uuid4()
    fake_row = MagicMock()

    r_rows = MagicMock()
    r_rows.scalars.return_value.all.return_value = [fake_row]
    r_totals = MagicMock()
    r_totals.one.return_value = (10, 20, Decimal("0.05"))

    session = MagicMock()
    session.execute = AsyncMock(side_effect=[r_rows, r_totals])

    svc = TokenUsageQueryService(session)
    rows, totals = await svc.list_rows(
        scope="self",
        scope_studio_id=None,
        scope_user_id=uid,
        studio_ids=None,
        software_ids=None,
        project_ids=None,
        user_ids=None,
        call_sources=None,
        work_order_ids=None,
        date_from=None,
        date_to=None,
        limit=50,
        offset=10,
    )
    assert rows == [fake_row]
    assert totals == (10, 20, Decimal("0.05"))
    assert session.execute.await_count == 2


def test_rows_to_csv_with_null_optionals_and_naive_created_at() -> None:
    vid = uuid.uuid4()
    row = SimpleNamespace(
        id=vid,
        studio_id=None,
        software_id=None,
        project_id=None,
        work_order_id=None,
        user_id=None,
        call_source="x",
        model="m",
        input_tokens=1,
        output_tokens=2,
        estimated_cost_usd=None,
        created_at=datetime(2026, 3, 1, 12, 0, 0),
    )
    svc = TokenUsageQueryService(MagicMock())
    csv_out = svc.rows_to_csv([row])
    assert str(vid) in csv_out
    assert csv_out.count(",") >= 10
    lines = csv_out.strip().split("\n")
    assert "call_source" in lines[0]


def test_rows_to_csv_with_timezone_aware_created_at() -> None:
    vid = uuid.uuid4()
    uid = uuid.uuid4()
    sid = uuid.uuid4()
    row = SimpleNamespace(
        id=vid,
        studio_id=sid,
        software_id=None,
        project_id=None,
        work_order_id=None,
        user_id=uid,
        call_source="chat",
        model="gpt-test",
        input_tokens=3,
        output_tokens=4,
        estimated_cost_usd=Decimal("0.01"),
        created_at=datetime(2026, 4, 1, tzinfo=timezone.utc),
    )
    svc = TokenUsageQueryService(MagicMock())
    csv_out = svc.rows_to_csv([row])
    assert "2026-04-01" in csv_out
    assert "T" in csv_out.split("\n")[1]
