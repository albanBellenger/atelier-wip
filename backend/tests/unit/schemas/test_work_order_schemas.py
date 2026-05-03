"""Work order request schemas — validation matches FastAPI 422 detail shape."""

from __future__ import annotations

import uuid

import pytest
from pydantic import ValidationError

from app.schemas.work_order import WorkOrderCreate, WorkOrderUpdate


def _assert_validation_error_has_fastapi_style_detail(exc: ValidationError) -> None:
    """FastAPI serializes ``ValidationError.errors()`` as ``response["detail"]``."""
    errors = exc.errors()
    assert isinstance(errors, list)
    assert len(errors) >= 1
    for item in errors:
        assert "type" in item
        assert "loc" in item
        assert "msg" in item


def test_work_order_create_invalid_status() -> None:
    with pytest.raises(ValidationError) as ei:
        WorkOrderCreate(
            title="t",
            description="d",
            status="not_a_valid_status",
            section_ids=[uuid.uuid4()],
        )
    _assert_validation_error_has_fastapi_style_detail(ei.value)
    assert any("status" in e["loc"] for e in ei.value.errors())


def test_work_order_update_invalid_status() -> None:
    with pytest.raises(ValidationError) as ei:
        WorkOrderUpdate(status="bogus")
    _assert_validation_error_has_fastapi_style_detail(ei.value)
    assert any("status" in e["loc"] for e in ei.value.errors())
