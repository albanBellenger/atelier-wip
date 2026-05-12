"""Unit tests for DocSyncService."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CodebaseFile, CodebaseSnapshot, Project, Section, Software, Studio, User, WorkOrder
from app.services.doc_sync_service import DocSyncService, _overlap_score
from app.services.llm_service import LLMService


def test_overlap_score_counts_shared_tokens() -> None:
    assert _overlap_score("alpha beta gamma", "beta delta") >= 1


@pytest.mark.asyncio
async def test_propose_not_indexed(db_session: AsyncSession) -> None:
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
    wo = WorkOrder(
        id=uuid.uuid4(),
        project_id=pr.id,
        title="W",
        description="token keyword",
        status="done",
        created_by=user.id,
    )
    db_session.add(wo)
    await db_session.flush()
    llm = MagicMock(spec=LLMService)
    svc = DocSyncService(db_session, llm)
    res = await svc.propose_for_work_order(wo.id, run_actor_id=user.id)
    assert res.skipped_reason == "not_indexed"
    llm.chat_structured.assert_not_called()


@pytest.mark.asyncio
async def test_propose_drops_unknown_section_and_accepts_empty(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    studio = Studio(id=uuid.uuid4(), name="S", description="d")
    db_session.add(studio)
    user = User(
        id=uuid.uuid4(),
        email="u2@e.com",
        password_hash="x",
        display_name="U2",
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
        publish_folder_slug="pub2",
    )
    db_session.add(pr)
    doc_sec = Section(
        id=uuid.uuid4(),
        project_id=None,
        software_id=sw.id,
        title="Auth",
        slug="auth",
        order=0,
        content="bearer token authentication",
    )
    db_session.add(doc_sec)
    wo = WorkOrder(
        id=uuid.uuid4(),
        project_id=pr.id,
        title="Tokens",
        description="bearer token flow",
        acceptance_criteria="token",
        status="done",
        created_by=user.id,
    )
    db_session.add(wo)
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
            path="a.py",
            blob_sha="b" * 40,
            size_bytes=2,
        )
    )
    await db_session.flush()

    async def fake_llm(_self: object, **_kwargs: object) -> dict[str, object]:
        return {
            "proposals": [
                {
                    "section_id": str(uuid.uuid4()),
                    "rationale": "bad id",
                    "replacement_markdown": "x",
                },
                {
                    "section_id": str(doc_sec.id),
                    "rationale": "ok",
                    "replacement_markdown": "new md",
                },
            ]
        }

    monkeypatch.setattr(
        "app.services.doc_sync_service.DocSyncAgent.propose_patches",
        fake_llm,
    )
    monkeypatch.setattr(
        "app.services.doc_sync_service.CodebaseRagService.retrieve_chunks_for_text",
        AsyncMock(return_value=[]),
    )

    llm = MagicMock(spec=LLMService)
    svc = DocSyncService(db_session, llm)
    res = await svc.propose_for_work_order(wo.id, run_actor_id=user.id)
    assert res.proposals_total == 2
    assert res.proposals_kept == 1
    assert res.proposals_dropped == 1

    monkeypatch.setattr(
        "app.services.doc_sync_service.DocSyncAgent.propose_patches",
        lambda *_a, **_k: {"proposals": []},
    )
    res2 = await svc.propose_for_work_order(wo.id, run_actor_id=user.id)
    assert res2.proposals_total == 0
    assert res2.proposals_kept == 0
