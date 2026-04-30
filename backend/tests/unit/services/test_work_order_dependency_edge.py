"""Unit: add_work_order_dependency sets depends_on edge type."""

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.work_order_service import WorkOrderService


@pytest.mark.asyncio
async def test_add_work_order_dependency_writes_depends_on_edge_type(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pid = uuid.uuid4()
    wid_pre = uuid.uuid4()
    wid_dep = uuid.uuid4()
    captured: dict[str, str] = {}

    async def fake_get_wo(self, project_id: uuid.UUID, wo_id: uuid.UUID) -> MagicMock:
        assert project_id == pid
        assert wo_id in (wid_pre, wid_dep)
        m = MagicMock()
        m.id = wo_id
        m.project_id = pid
        return m

    async def fake_add_edge(_self, **kwargs: object) -> None:
        captured["edge_type"] = str(kwargs.get("edge_type", ""))

    monkeypatch.setattr(
        "app.services.work_order_service.WorkOrderService._get_wo",
        fake_get_wo,
    )
    monkeypatch.setattr(
        "app.services.graph_service.GraphService.add_edge",
        fake_add_edge,
    )

    db = MagicMock()
    db.flush = AsyncMock()
    svc = WorkOrderService(db)
    await svc.add_work_order_dependency(pid, wid_dep, wid_pre)

    assert captured.get("edge_type") == "depends_on"
    db.flush.assert_awaited_once()
