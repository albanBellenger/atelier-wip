"""Unit tests for ArtifactExclusionService (mocked AsyncSession)."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.exceptions import ApiError
from app.services.artifact_exclusion_service import ArtifactExclusionService


@pytest.mark.asyncio
async def test_set_software_exclusion_raises_not_found_when_software_missing() -> None:
    db = AsyncMock()
    db.get = AsyncMock(return_value=None)
    svc = ArtifactExclusionService(db)
    with pytest.raises(ApiError) as exc:
        await svc.set_software_exclusion(
            studio_id=uuid.uuid4(),
            software_id=uuid.uuid4(),
            artifact_id=uuid.uuid4(),
            excluded=True,
            user_id=uuid.uuid4(),
        )
    assert exc.value.status_code == 404
    assert exc.value.error_code == "NOT_FOUND"


@pytest.mark.asyncio
async def test_set_software_exclusion_raises_when_studio_mismatch() -> None:
    sw = MagicMock()
    sw.studio_id = uuid.uuid4()
    db = AsyncMock()
    db.get = AsyncMock(return_value=sw)
    svc = ArtifactExclusionService(db)
    with pytest.raises(ApiError) as exc:
        await svc.set_software_exclusion(
            studio_id=uuid.uuid4(),
            software_id=uuid.uuid4(),
            artifact_id=uuid.uuid4(),
            excluded=True,
            user_id=uuid.uuid4(),
        )
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_set_software_exclusion_raises_when_artifact_not_under_software() -> None:
    studio_id = uuid.uuid4()
    sw_id = uuid.uuid4()
    sw = MagicMock()
    sw.studio_id = studio_id

    empty = MagicMock()
    empty.scalar_one_or_none.return_value = None

    db = AsyncMock()
    db.get = AsyncMock(return_value=sw)
    db.execute = AsyncMock(return_value=empty)

    svc = ArtifactExclusionService(db)
    with pytest.raises(ApiError) as exc:
        await svc.set_software_exclusion(
            studio_id=studio_id,
            software_id=sw_id,
            artifact_id=uuid.uuid4(),
            excluded=True,
            user_id=uuid.uuid4(),
        )
    assert exc.value.status_code == 404
    assert db.execute.await_count == 2


@pytest.mark.asyncio
async def test_set_software_exclusion_inserts_when_excluding_and_no_row() -> None:
    studio_id = uuid.uuid4()
    sw_id = uuid.uuid4()
    art_id = uuid.uuid4()
    user_id = uuid.uuid4()

    sw = MagicMock()
    sw.studio_id = studio_id
    art = MagicMock()

    res_art = MagicMock()
    res_art.scalar_one_or_none.return_value = art
    res_ex = MagicMock()
    res_ex.scalar_one_or_none.return_value = None

    db = AsyncMock()
    db.get = AsyncMock(return_value=sw)
    db.execute = AsyncMock(side_effect=[res_art, res_ex])
    db.add = MagicMock()
    db.flush = AsyncMock()

    svc = ArtifactExclusionService(db)
    ok = await svc.set_software_exclusion(
        studio_id=studio_id,
        software_id=sw_id,
        artifact_id=art_id,
        excluded=True,
        user_id=user_id,
    )
    assert ok is True
    db.add.assert_called_once()
    db.flush.assert_awaited()


@pytest.mark.asyncio
async def test_set_software_exclusion_deletes_when_clearing_existing() -> None:
    studio_id = uuid.uuid4()
    sw_id = uuid.uuid4()
    art_id = uuid.uuid4()
    user_id = uuid.uuid4()

    sw = MagicMock()
    sw.studio_id = studio_id
    art = MagicMock()
    row = MagicMock()

    res_art = MagicMock()
    res_art.scalar_one_or_none.return_value = art
    res_ex = MagicMock()
    res_ex.scalar_one_or_none.return_value = row

    db = AsyncMock()
    db.get = AsyncMock(return_value=sw)
    db.execute = AsyncMock(side_effect=[res_art, res_ex])
    db.delete = AsyncMock()
    db.flush = AsyncMock()

    svc = ArtifactExclusionService(db)
    ok = await svc.set_software_exclusion(
        studio_id=studio_id,
        software_id=sw_id,
        artifact_id=art_id,
        excluded=False,
        user_id=user_id,
    )
    assert ok is False
    db.delete.assert_awaited_once_with(row)
    db.flush.assert_awaited()


@pytest.mark.asyncio
async def test_set_project_exclusion_raises_when_project_wrong_software() -> None:
    studio_id = uuid.uuid4()
    sw_id = uuid.uuid4()
    proj_id = uuid.uuid4()

    sw = MagicMock()
    sw.studio_id = studio_id
    proj = MagicMock()
    proj.software_id = uuid.uuid4()

    db = AsyncMock()
    db.get = AsyncMock(side_effect=[sw, proj])
    svc = ArtifactExclusionService(db)
    with pytest.raises(ApiError) as exc:
        await svc.set_project_exclusion(
            studio_id=studio_id,
            software_id=sw_id,
            project_id=proj_id,
            artifact_id=uuid.uuid4(),
            excluded=True,
            user_id=uuid.uuid4(),
        )
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_set_project_exclusion_inserts_when_excluding_and_no_row() -> None:
    studio_id = uuid.uuid4()
    sw_id = uuid.uuid4()
    proj_id = uuid.uuid4()
    art_id = uuid.uuid4()
    user_id = uuid.uuid4()

    sw = MagicMock()
    sw.studio_id = studio_id
    proj = MagicMock()
    proj.software_id = sw_id
    art = MagicMock()

    res_art = MagicMock()
    res_art.scalar_one_or_none.return_value = art
    res_ex = MagicMock()
    res_ex.scalar_one_or_none.return_value = None

    db = AsyncMock()
    db.get = AsyncMock(side_effect=[sw, proj])
    db.execute = AsyncMock(side_effect=[res_art, res_ex])
    db.add = MagicMock()
    db.flush = AsyncMock()

    svc = ArtifactExclusionService(db)
    ok = await svc.set_project_exclusion(
        studio_id=studio_id,
        software_id=sw_id,
        project_id=proj_id,
        artifact_id=art_id,
        excluded=True,
        user_id=user_id,
    )
    assert ok is True
    db.add.assert_called_once()
    db.flush.assert_awaited()
