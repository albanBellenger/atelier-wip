"""Unit tests for CodeDriftService (mocked LLM + RAG)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import pytest

from app.models import CodebaseFile, CodebaseSnapshot, Issue, Project, Section, Software, Studio, User
from app.services.code_drift_service import CodeDriftService
from app.services.llm_service import LLMService


@pytest.mark.asyncio
async def test_run_for_software_not_indexed_returns_skipped(db_session: AsyncSession) -> None:
    studio = Studio(id=uuid.uuid4(), name="S", description="d")
    db_session.add(studio)
    sw = Software(
        id=uuid.uuid4(),
        studio_id=studio.id,
        name="Sw",
        description="d",
        definition="def",
    )
    db_session.add(sw)
    await db_session.flush()
    llm = MagicMock(spec=LLMService)
    svc = CodeDriftService(db_session, llm)
    res = await svc.run_for_software(sw.id, uuid.uuid4())
    assert res.skipped_reason == "not_indexed"
    llm.ensure_openai_llm_ready.assert_not_called()


@pytest.mark.asyncio
async def test_run_clears_only_code_drift_kinds(db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
    studio = Studio(id=uuid.uuid4(), name="S", description="d")
    db_session.add(studio)
    user = User(
        id=uuid.uuid4(),
        email="u@e.com",
        password_hash="x",
        display_name="U",
    )
    db_session.add(user)
    sw = Software(
        id=uuid.uuid4(),
        studio_id=studio.id,
        name="Sw",
        description="d",
        definition="def",
    )
    db_session.add(sw)
    pr = Project(
        id=uuid.uuid4(),
        software_id=sw.id,
        name="P",
        description=None,
        publish_folder_slug="pub",
    )
    db_session.add(pr)
    await db_session.flush()
    sec = Section(
        id=uuid.uuid4(),
        project_id=pr.id,
        software_id=None,
        title="A",
        slug="a",
        order=0,
        content="body",
    )
    db_session.add(sec)
    drift = Issue(
        id=uuid.uuid4(),
        project_id=pr.id,
        software_id=sw.id,
        kind="code_drift_section",
        section_a_id=sec.id,
        description="old drift",
        status="open",
        origin="auto",
        run_actor_id=user.id,
    )
    conflict = Issue(
        id=uuid.uuid4(),
        project_id=pr.id,
        software_id=sw.id,
        kind="conflict_or_gap",
        section_a_id=sec.id,
        section_b_id=None,
        description="gap",
        status="open",
        origin="auto",
        run_actor_id=user.id,
    )
    db_session.add(drift)
    db_session.add(conflict)
    snap = CodebaseSnapshot(
        id=uuid.uuid4(),
        software_id=sw.id,
        commit_sha="c" * 40,
        branch="main",
        status="ready",
        ready_at=datetime.now(timezone.utc),
    )
    db_session.add(snap)
    db_session.add(
        CodebaseFile(
            id=uuid.uuid4(),
            snapshot_id=snap.id,
            path="x.py",
            blob_sha="b" * 40,
            size_bytes=4,
        )
    )
    await db_session.flush()

    llm = MagicMock(spec=LLMService)
    llm.ensure_openai_llm_ready = AsyncMock(return_value=None)

    async def fake_section(*_a: object, **_k: object) -> dict[str, object]:
        return {
            "likely_drifted": False,
            "severity": "low",
            "reason": "ok",
            "code_refs": [],
        }

    async def fake_wo(*_a: object, **_k: object) -> dict[str, object]:
        return {"verdict": "complete", "reason": "ok", "code_refs": []}

    monkeypatch.setattr(
        "app.services.code_drift_service.CodeDriftSectionAgent.analyse",
        fake_section,
    )
    monkeypatch.setattr(
        "app.services.code_drift_service.CodeDriftWorkOrderAgent.analyse",
        fake_wo,
    )
    monkeypatch.setattr(
        "app.services.code_drift_service.CodebaseRagService.retrieve_chunks_for_text",
        AsyncMock(return_value=[{"path": "x.py", "snippet": "z", "start_line": 1, "end_line": 2, "score": 0.1}]),
    )

    svc = CodeDriftService(db_session, llm)
    res = await svc.run_for_software(sw.id, user.id)
    assert res.sections_evaluated >= 1
    assert res.sections_flagged == 0
    assert res.work_orders_flagged == 0
    await db_session.flush()
    rows = (await db_session.execute(select(Issue))).scalars().all()
    kinds = {r.kind for r in rows}
    assert "conflict_or_gap" in kinds
    assert "code_drift_section" not in kinds
