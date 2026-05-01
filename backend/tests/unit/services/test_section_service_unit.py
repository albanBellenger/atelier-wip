"""Unit tests for SectionService and helpers (mocked session)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from pycrdt import Doc

from app.exceptions import ApiError
from app.models import Section
from app.schemas.section import SectionUpdate
from app.services.section_service import (
    SectionService,
    slugify_title,
    snapshot_from_yjs_update_bytes,
)


def test_snapshot_from_yjs_missing_field_returns_empty_string() -> None:
    doc = Doc()
    blob = doc.get_update()
    assert snapshot_from_yjs_update_bytes(blob) == ""


def test_snapshot_from_yjs_none_blob() -> None:
    assert snapshot_from_yjs_update_bytes(None) is None


def test_slugify_title_empty_fallback() -> None:
    assert slugify_title("@@@") == "section"


def test_slugify_title_unicode() -> None:
    assert "caf" in slugify_title("Café API")


@pytest.mark.asyncio
async def test_next_unique_slug_collision_then_unique() -> None:
    pid = uuid.uuid4()
    db = AsyncMock()
    calls: list[object] = []

    async def exec_side(*args: object, **kwargs: object) -> MagicMock:
        q = str(args[0])
        if calls:
            r = MagicMock()
            r.scalar_one_or_none.return_value = None
            return r
        calls.append(1)
        r = MagicMock()
        r.scalar_one_or_none.return_value = uuid.uuid4()
        return r

    db.execute = AsyncMock(side_effect=exec_side)
    out = await SectionService(db)._next_unique_slug(pid, "foo")
    assert out == "foo-2"


@pytest.mark.asyncio
async def test_next_order_empty_project() -> None:
    db = AsyncMock()
    r = MagicMock()
    r.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=r)
    n = await SectionService(db)._next_order(uuid.uuid4())
    assert n == 0


@pytest.mark.asyncio
async def test_next_order_after_max() -> None:
    db = AsyncMock()
    r = MagicMock()
    r.scalar_one_or_none.return_value = 3
    db.execute = AsyncMock(return_value=r)
    n = await SectionService(db)._next_order(uuid.uuid4())
    assert n == 4


@pytest.mark.asyncio
async def test_get_section_not_found() -> None:
    db = AsyncMock()
    db.get = AsyncMock(return_value=None)
    with pytest.raises(ApiError) as e:
        await SectionService(db).get_section(uuid.uuid4(), uuid.uuid4())
    assert e.value.error_code == "NOT_FOUND"


@pytest.mark.asyncio
async def test_delete_section_forbidden_non_admin() -> None:
    db = AsyncMock()
    with pytest.raises(ApiError) as e:
        await SectionService(db).delete_section(
            uuid.uuid4(), uuid.uuid4(), actor_is_studio_admin=False
        )
    assert e.value.status_code == 403


@pytest.mark.asyncio
async def test_update_section_structure_forbidden_for_member(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sid = uuid.uuid4()
    pid = uuid.uuid4()
    now = datetime.now(timezone.utc)
    sec = Section(
        id=sid,
        project_id=pid,
        title="Old",
        slug="old",
        order=0,
        content="",
        created_at=now,
        updated_at=now,
    )
    db = AsyncMock()
    db.get = AsyncMock(return_value=sec)
    body = SectionUpdate(title="New Title")
    with pytest.raises(ApiError) as e:
        await SectionService(db).update_section(
            pid, sid, body, is_studio_admin=False
        )
    assert e.value.status_code == 403


@pytest.mark.asyncio
async def test_reorder_sections_duplicate_id() -> None:
    pid = uuid.uuid4()
    a, b = uuid.uuid4(), uuid.uuid4()
    now = datetime.now(timezone.utc)
    sa = Section(
        id=a,
        project_id=pid,
        title="A",
        slug="a",
        order=0,
        content="",
        created_at=now,
        updated_at=now,
    )
    sb = Section(
        id=b,
        project_id=pid,
        title="B",
        slug="b",
        order=1,
        content="",
        created_at=now,
        updated_at=now,
    )
    ex = MagicMock()
    ex.scalars.return_value.all.return_value = [sa, sb]
    db = AsyncMock()
    db.execute = AsyncMock(return_value=ex)
    with pytest.raises(ApiError) as e:
        await SectionService(db).reorder_sections(pid, [a, a])
    assert "duplicate" in str(e.value.detail).lower()


@pytest.mark.asyncio
async def test_update_section_content_schedules_embedding(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sid = uuid.uuid4()
    pid = uuid.uuid4()
    now = datetime.now(timezone.utc)
    sec = Section(
        id=sid,
        project_id=pid,
        title="T",
        slug="t",
        order=0,
        content="old",
        created_at=now,
        updated_at=now,
    )
    db = AsyncMock()
    db.get = AsyncMock(return_value=sec)
    ex = MagicMock()
    ex.scalars.return_value.all.return_value = []
    db.execute = AsyncMock(return_value=ex)
    emb: list[uuid.UUID] = []
    drift: list[uuid.UUID] = []

    def fake_emb(i: uuid.UUID) -> None:
        emb.append(i)

    def fake_drift(i: uuid.UUID) -> None:
        drift.append(i)

    monkeypatch.setattr(
        "app.services.embedding_pipeline.schedule_section_embedding",
        fake_emb,
    )
    monkeypatch.setattr(
        "app.services.drift_pipeline.schedule_drift_check",
        fake_drift,
    )
    body = SectionUpdate(content="new body")
    await SectionService(db).update_section(
        pid, sid, body, is_studio_admin=True
    )
    assert emb == [sid]
    assert drift == [sid]
