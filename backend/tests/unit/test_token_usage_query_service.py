"""Unit tests for token usage query service."""

from decimal import Decimal
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
        scope="tool_admin",
        scope_studio_id=None,
        scope_user_id=None,
        studio_ids=None,
        software_ids=None,
        project_ids=None,
        user_ids=None,
        call_types=["mcp"],
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
