"""Unit tests for ConflictAgent (analysis flow, edge creation, LLM errors)."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.agents.conflict_agent import ConflictAgent
from app.exceptions import ApiError
from app.models import Issue, Project, Section, Software
from app.services.llm_service import LLMService


@pytest.mark.asyncio
async def test_clear_open_auto_issues_runs_delete() -> None:
    db = AsyncMock()
    llm = LLMService(db)
    await ConflictAgent(db, llm).clear_open_auto_issues(uuid.uuid4())
    assert db.execute.await_count == 1


@pytest.mark.asyncio
async def test_run_conflict_analysis_raises_when_no_project_context() -> None:
    """Empty sections (or missing software chain) -> NOT_FOUND before analysis."""
    db = AsyncMock()
    llm = LLMService(db)
    res = MagicMock()
    res.scalars.return_value.all.return_value = []
    db.execute = AsyncMock(return_value=res)
    with pytest.raises(ApiError) as e:
        await ConflictAgent(db, llm).run_conflict_analysis(
            project_id=uuid.uuid4(),
            run_actor_id=uuid.uuid4(),
            origin="manual",
        )
    assert e.value.error_code == "NOT_FOUND"


@pytest.mark.asyncio
async def test_run_conflict_analysis_returns_zero_on_llm_api_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pid = uuid.uuid4()
    aid = uuid.uuid4()
    studio_id = uuid.uuid4()
    software_id = uuid.uuid4()

    sec = Section(
        id=aid,
        project_id=pid,
        title="A",
        slug="a",
        order=0,
        content="body " * 100,
    )
    pr = Project(
        id=pid,
        software_id=software_id,
        name="P",
        description=None,
        publish_folder_slug="p",
    )
    sw = Software(
        id=software_id,
        studio_id=studio_id,
        name="S",
        description="d",
        definition="def",
    )

    r1 = MagicMock()
    r1.scalars.return_value.all.return_value = [sec]
    r_del = MagicMock()
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[r1, r_del])
    db.get = AsyncMock(side_effect=[pr, sw])
    db.add = MagicMock()
    db.flush = AsyncMock()
    llm = LLMService(db)

    async def boom(self, **kwargs):
        raise ApiError(status_code=502, code="LLM_ERR", message="down")

    monkeypatch.setattr(
        "app.agents.conflict_agent.LLMService.chat_structured",
        boom,
    )

    n = await ConflictAgent(db, llm).run_conflict_analysis(
        project_id=pid,
        run_actor_id=uuid.uuid4(),
        origin="manual",
    )
    assert n == 0


@pytest.mark.asyncio
async def test_run_conflict_analysis_creates_pair_issue_and_edges(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pid = uuid.uuid4()
    aid, bid = uuid.uuid4(), uuid.uuid4()
    studio_id = uuid.uuid4()
    software_id = uuid.uuid4()
    sa = Section(
        id=aid,
        project_id=pid,
        title="A",
        slug="a",
        order=0,
        content="pay by card",
    )
    sb = Section(
        id=bid,
        project_id=pid,
        title="B",
        slug="b",
        order=1,
        content="pay by wire",
    )
    pr = Project(
        id=pid,
        software_id=software_id,
        name="P",
        description=None,
        publish_folder_slug="p",
    )
    sw = Software(
        id=software_id,
        studio_id=studio_id,
        name="S",
        description="d",
        definition="def",
    )
    r1 = MagicMock()
    r1.scalars.return_value.all.return_value = [sa, sb]
    r_del = MagicMock()
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[r1, r_del])
    db.get = AsyncMock(side_effect=[pr, sw])
    db.add = MagicMock()
    db.flush = AsyncMock()
    llm = LLMService(db)

    add_calls: list[str] = []

    async def capture_add(self, **kwargs):
        if kwargs.get("edge_type") == "involves":
            add_calls.append("inv")

    monkeypatch.setattr(
        "app.services.graph_service.GraphService.add_edge",
        capture_add,
    )

    async def ok_llm(self, **kwargs):
        return {
            "findings": [
                {
                    "finding_type": "pair_conflict",
                    "section_index_a": 0,
                    "section_index_b": 1,
                    "description": "Payment mismatch",
                    "heading_index": None,
                    "heading_index_a": 0,
                    "heading_index_b": 1,
                }
            ]
        }

    monkeypatch.setattr(
        "app.agents.conflict_agent.LLMService.chat_structured",
        ok_llm,
    )

    n = await ConflictAgent(db, llm).run_conflict_analysis(
        project_id=pid,
        run_actor_id=uuid.uuid4(),
        origin="manual",
    )
    assert n == 1
    assert len(add_calls) == 2
    assert db.add.called


@pytest.mark.asyncio
async def test_run_conflict_analysis_skips_malformed_findings(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pid = uuid.uuid4()
    software_id = uuid.uuid4()
    studio_id = uuid.uuid4()
    sa = Section(
        id=uuid.uuid4(),
        project_id=pid,
        title="A",
        slug="a",
        order=0,
        content="x",
    )
    pr = Project(
        id=pid,
        software_id=software_id,
        name="P",
        description=None,
        publish_folder_slug="p",
    )
    sw = Software(
        id=software_id, studio_id=studio_id, name="S", description="d", definition="d"
    )
    r1 = MagicMock()
    r1.scalars.return_value.all.return_value = [sa]
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[r1, MagicMock()])
    db.get = AsyncMock(side_effect=[pr, sw])
    db.flush = AsyncMock()
    llm = LLMService(db)

    async def bad(self, **kwargs):
        return {
            "findings": [
                {
                    "finding_type": "pair_conflict",
                    "section_index_a": 0,
                    "section_index_b": 0,
                    "description": "self ref",
                    "heading_index": None,
                    "heading_index_a": None,
                    "heading_index_b": None,
                },
                "not a dict",
                {
                    "finding_type": "pair_conflict",
                    "section_index_a": 0,
                    "section_index_b": 5,
                    "description": "oob",
                    "heading_index": None,
                    "heading_index_a": None,
                    "heading_index_b": None,
                },
            ]
        }

    monkeypatch.setattr(
        "app.agents.conflict_agent.LLMService.chat_structured",
        bad,
    )

    n = await ConflictAgent(db, llm).run_conflict_analysis(
        project_id=pid,
        run_actor_id=uuid.uuid4(),
        origin="auto",
    )
    assert n == 0


@pytest.mark.asyncio
async def test_run_conflict_analysis_persists_heading_payload_json(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pid = uuid.uuid4()
    aid, bid = uuid.uuid4(), uuid.uuid4()
    studio_id = uuid.uuid4()
    software_id = uuid.uuid4()
    sa = Section(
        id=aid,
        project_id=pid,
        title="A",
        slug="a",
        order=0,
        content="# Pay\npay by card",
    )
    sb = Section(
        id=bid,
        project_id=pid,
        title="B",
        slug="b",
        order=1,
        content="# Pay\npay by wire",
    )
    pr = Project(
        id=pid,
        software_id=software_id,
        name="P",
        description=None,
        publish_folder_slug="p",
    )
    sw = Software(
        id=software_id,
        studio_id=studio_id,
        name="S",
        description="d",
        definition="def",
    )
    r1 = MagicMock()
    r1.scalars.return_value.all.return_value = [sa, sb]
    r_del = MagicMock()
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[r1, r_del])
    db.get = AsyncMock(side_effect=[pr, sw])
    added: list[Issue] = []

    def capture_add(obj: object) -> None:
        if isinstance(obj, Issue):
            added.append(obj)

    db.add = MagicMock(side_effect=capture_add)
    db.flush = AsyncMock()
    llm = LLMService(db)

    async def noop_add_edge(self, **kwargs):
        return None

    monkeypatch.setattr(
        "app.services.graph_service.GraphService.add_edge",
        noop_add_edge,
    )

    async def gap_and_pair(self, **kwargs):
        return {
            "findings": [
                {
                    "finding_type": "section_gap",
                    "section_index_a": 0,
                    "section_index_b": None,
                    "description": "Missing refund policy",
                    "heading_index": 2,
                    "heading_index_a": None,
                    "heading_index_b": None,
                },
                {
                    "finding_type": "pair_conflict",
                    "section_index_a": 0,
                    "section_index_b": 1,
                    "description": "Payment mismatch",
                    "heading_index": None,
                    "heading_index_a": 0,
                    "heading_index_b": 3,
                },
            ]
        }

    monkeypatch.setattr(
        "app.agents.conflict_agent.LLMService.chat_structured",
        gap_and_pair,
    )

    n = await ConflictAgent(db, llm).run_conflict_analysis(
        project_id=pid,
        run_actor_id=uuid.uuid4(),
        origin="auto",
    )
    assert n == 2
    assert len(added) == 2
    gap_issue = next(i for i in added if i.section_b_id is None)
    pair_issue = next(i for i in added if i.section_b_id is not None)
    assert gap_issue.payload_json == {"finding_type": "section_gap", "heading_index": 2}
    assert pair_issue.payload_json == {
        "finding_type": "pair_conflict",
        "heading_index_a": 0,
        "heading_index_b": 3,
    }
