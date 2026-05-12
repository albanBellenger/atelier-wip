"""Codebase snapshot supersede rules — stale pending rows (Slice 16b)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CodebaseChunk, CodebaseFile, CodebaseSnapshot
from app.services.codebase_service import CodebaseService
from tests.factories import create_software, create_studio, create_user


@pytest.mark.asyncio
async def test_supersede_sibling_snapshots_marks_other_pending_and_prior_ready(
    db_session: AsyncSession,
) -> None:
    """When a snapshot becomes the canonical ready row, older pending and ready rows are superseded."""
    sfx = uuid.uuid4().hex[:8]
    owner = await create_user(db_session, email=f"ss-{sfx}@example.com")
    studio = await create_studio(db_session, name=f"SS{sfx}")
    sw = await create_software(db_session, studio.id, name="SW-SS")

    keep = CodebaseSnapshot(
        software_id=sw.id,
        commit_sha="cafebabe" * 4,
        branch="main",
        status="ready",
        ready_at=datetime.now(timezone.utc),
    )
    stale_pending = CodebaseSnapshot(
        software_id=sw.id,
        commit_sha="cafebabe" * 4,
        branch="main",
        status="pending",
    )
    prior_ready = CodebaseSnapshot(
        software_id=sw.id,
        commit_sha="deadbeef" * 4,
        branch="main",
        status="ready",
        ready_at=datetime.now(timezone.utc),
    )
    db_session.add_all([keep, stale_pending, prior_ready])
    await db_session.flush()

    old_file = CodebaseFile(
        snapshot_id=prior_ready.id,
        path="legacy.py",
        blob_sha="b1",
        size_bytes=4,
        language="python",
    )
    db_session.add(old_file)
    await db_session.flush()
    db_session.add(
        CodebaseChunk(
            snapshot_id=prior_ready.id,
            file_id=old_file.id,
            chunk_index=0,
            content="x",
            embedding=[0.0] * 1536,
            start_line=1,
            end_line=1,
        )
    )
    await db_session.flush()

    svc = CodebaseService(db_session)
    await svc._supersede_sibling_snapshots(sw.id, keep.id)

    await db_session.refresh(stale_pending)
    await db_session.refresh(prior_ready)
    assert stale_pending.status == "superseded"
    assert prior_ready.status == "superseded"
    assert keep.status == "ready"

    n_chunks = int(
        await db_session.scalar(
            select(func.count())
            .select_from(CodebaseChunk)
            .where(CodebaseChunk.snapshot_id == prior_ready.id)
        )
        or 0
    )
    assert n_chunks == 0


@pytest.mark.asyncio
async def test_run_index_snapshot_noops_when_already_superseded(
    db_session: AsyncSession,
) -> None:
    """A background task for a snapshot superseded before start must not flip it to indexing."""
    sfx = uuid.uuid4().hex[:8]
    await create_user(db_session, email=f"noop-{sfx}@example.com")
    studio = await create_studio(db_session, name=f"Noop{sfx}")
    sw = await create_software(db_session, studio.id, name="SW-Noop")
    sw.git_repo_url = "https://gitlab.com/g/r"
    sw.git_branch = "main"
    await db_session.flush()

    snap = CodebaseSnapshot(
        software_id=sw.id,
        commit_sha="abc" * 10,
        branch="main",
        status="superseded",
    )
    db_session.add(snap)
    await db_session.flush()

    svc = CodebaseService(db_session)
    await svc.run_index_snapshot(snap.id)

    await db_session.refresh(snap)
    assert snap.status == "superseded"


@pytest.mark.asyncio
async def test_run_index_snapshot_noops_when_already_ready(
    db_session: AsyncSession,
) -> None:
    """Duplicate enqueue for an already-ready snapshot does not re-run indexing."""
    sfx = uuid.uuid4().hex[:8]
    await create_user(db_session, email=f"rdy-{sfx}@example.com")
    studio = await create_studio(db_session, name=f"Rdy{sfx}")
    sw = await create_software(db_session, studio.id, name="SW-Rdy")
    sw.git_repo_url = "https://gitlab.com/g/r2"
    sw.git_branch = "main"
    await db_session.flush()

    snap = CodebaseSnapshot(
        software_id=sw.id,
        commit_sha="def" * 10,
        branch="main",
        status="ready",
        ready_at=datetime.now(timezone.utc),
    )
    db_session.add(snap)
    await db_session.flush()

    svc = CodebaseService(db_session)
    tree_mock = AsyncMock(side_effect=AssertionError("list_repo_tree should not run"))
    with patch("app.services.codebase_service.list_repo_tree", tree_mock):
        await svc.run_index_snapshot(snap.id)

    await db_session.refresh(snap)
    assert snap.status == "ready"
    tree_mock.assert_not_called()
