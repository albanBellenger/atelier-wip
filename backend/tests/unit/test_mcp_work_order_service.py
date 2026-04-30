"""Unit tests for MCP work-order service."""

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.exceptions import ApiError
from app.models import WorkOrder
from app.services.mcp_work_order_service import McpWorkOrderService


@pytest.mark.asyncio
async def test_pull_payload_missing_project_returns_api_error_not_assertion() -> None:
    """When Project row is missing after _ensure, pull_payload raises ApiError 404."""
    studio_id = uuid.uuid4()
    wo_id = uuid.uuid4()
    pid = uuid.uuid4()

    wo = MagicMock(spec=WorkOrder)
    wo.id = wo_id
    wo.project_id = pid

    db = MagicMock()
    db.get = AsyncMock(return_value=None)

    svc = McpWorkOrderService(db)
    svc._ensure_wo_in_studio = AsyncMock(return_value=wo)  # type: ignore[method-assign]

    with pytest.raises(ApiError) as excinfo:
        await svc.pull_payload(studio_id, wo_id)

    assert excinfo.value.status_code == 404
    assert excinfo.value.error_code == "NOT_FOUND"
