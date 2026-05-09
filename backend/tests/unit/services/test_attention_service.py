"""Unit tests for attention helpers."""

import uuid
from unittest.mock import AsyncMock

import pytest

from app.exceptions import ApiError
from app.models import Project
from app.services.attention_service import AttentionService, _slug_file


def test_slug_file_appends_md() -> None:
    assert _slug_file("auth") == "auth.md"


def test_slug_file_empty_slug() -> None:
    assert _slug_file("") == "section.md"
    assert _slug_file("   ") == "section.md"


@pytest.mark.asyncio
async def test_list_project_attention_project_not_found() -> None:
    db = AsyncMock()
    db.get = AsyncMock(return_value=None)
    with pytest.raises(ApiError) as ei:
        await AttentionService(db).list_project_attention(
            project_id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            is_studio_admin=False,
        )
    assert ei.value.status_code == 404


@pytest.mark.asyncio
async def test_list_project_attention_software_not_found() -> None:
    pid = uuid.uuid4()
    sfid = uuid.uuid4()
    proj = Project(
        id=pid,
        software_id=sfid,
        name="P",
        description=None,
        publish_folder_slug="p",
        archived=False,
    )
    db = AsyncMock()

    async def get_side(model: type, pk: object) -> object:
        if model is Project and pk == pid:
            return proj
        return None

    db.get = AsyncMock(side_effect=get_side)
    with pytest.raises(ApiError) as ei:
        await AttentionService(db).list_project_attention(
            project_id=pid,
            user_id=uuid.uuid4(),
            is_studio_admin=False,
        )
    assert ei.value.status_code == 404
