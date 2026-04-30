"""WorkOrderUpdate section_ids validation."""

import pytest
from pydantic import ValidationError

from app.schemas.work_order import WorkOrderUpdate


def test_work_order_update_empty_section_ids_raises() -> None:
    with pytest.raises(ValidationError) as excinfo:
        WorkOrderUpdate(section_ids=[])
    err = excinfo.value.errors()[0]
    assert err["type"] == "SECTION_REQUIRED"
