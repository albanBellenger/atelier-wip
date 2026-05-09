"""Unit tests for AdminOverviewService (mocked dependencies)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest

from app.models import Studio
from app.services.admin_overview_service import AdminOverviewService


@pytest.mark.asyncio
async def test_overview_aggregates(monkeypatch: pytest.MonkeyPatch) -> None:
    sid = uuid.uuid4()
    now = datetime.now(timezone.utc)
    studio = Studio(
        id=sid,
        name="Studio One",
        description="d",
        logo_path=None,
        created_at=now,
        budget_cap_monthly_usd=Decimal("50.00"),
        budget_overage_action="pause_generations",
        git_provider=None,
        git_repo_url=None,
        git_token=None,
        git_branch=None,
        git_publish_strategy=None,
    )

    async def fake_maps(_db: object) -> tuple:
        mtd_map = {sid: Decimal("10.00")}
        sw_map = {sid: 2}
        mem_map = {sid: 5}
        return [studio], mtd_map, sw_map, mem_map

    monkeypatch.setattr(
        "app.services.admin_overview_service.load_studio_aggregate_maps",
        fake_maps,
    )

    async def fake_recent(_self: object, *, limit: int, offset: int) -> tuple:
        return [], 0

    monkeypatch.setattr(
        "app.services.admin_overview_service.AdminActivityService.list_recent",
        fake_recent,
    )

    db = AsyncMock()
    db.scalar = AsyncMock(side_effect=[5, 100, 200])

    out = await AdminOverviewService(db).overview()
    assert len(out.studios) == 1
    assert out.studios[0].studio_id == sid
    assert out.studios[0].software_count == 2
    assert out.studios[0].member_count == 5
    assert out.active_builders_count == 5
    assert out.embedding_collection_count == 300
    assert out.recent_activity == []
