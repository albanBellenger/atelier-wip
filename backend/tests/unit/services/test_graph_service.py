"""Unit tests for GraphService (nodes, dedup edges, relationship detection)."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.exceptions import ApiError
from app.agents.section_relationship_agent import SectionRelationshipAgent
from app.services.graph_service import GraphService, node_id
from app.services.llm_service import LLMService


def test_node_id_format() -> None:
    u = uuid.uuid4()
    assert node_id("section", u) == f"section:{u}"


@pytest.mark.asyncio
async def test_add_edge_inserts_when_absent() -> None:
    db = AsyncMock()
    db.add = MagicMock()
    er = MagicMock()
    er.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=er)

    gs = GraphService(db)
    pid = uuid.uuid4()
    s = uuid.uuid4()
    t = uuid.uuid4()
    await gs.add_edge(
        project_id=pid,
        source_type="section",
        source_id=s,
        target_type="issue",
        target_id=t,
        edge_type="involves",
    )
    db.add.assert_called_once()
    added = db.add.call_args[0][0]
    assert added.edge_type == "involves"


@pytest.mark.asyncio
async def test_add_edge_skips_duplicate() -> None:
    db = AsyncMock()
    er = MagicMock()
    er.scalar_one_or_none.return_value = uuid.uuid4()
    db.execute = AsyncMock(return_value=er)
    gs = GraphService(db)
    pid, s, t = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    await gs.add_edge(
        project_id=pid,
        source_type="section",
        source_id=s,
        target_type="issue",
        target_id=t,
        edge_type="involves",
    )
    db.add.assert_not_called()


@pytest.mark.asyncio
async def test_get_graph_builds_nodes_and_edges(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = AsyncMock()
    sid, wid, aid, iid, eid = [uuid.uuid4() for _ in range(5)]

    class Sec:
        id = sid
        title = "My Section"
        content = ""

    class WO:
        id = wid
        title = "WO"
        is_stale = True

    class Art:
        id = aid
        name = "file.pdf"

    class Iss:
        id = iid
        description = "long " * 20
        status = "open"
        kind = "conflict_or_gap"

    class Edge:
        source_type = "section"
        source_id = sid
        target_type = "work_order"
        target_id = wid
        edge_type = "generates"

    def mk_result(rows):
        m = MagicMock()
        m.scalars.return_value.all.return_value = rows
        return m

    db.execute = AsyncMock(
        side_effect=[
            mk_result([Sec]),
            mk_result([]),  # software_doc_section query (no rows)
            mk_result([WO]),
            mk_result([Art]),
            mk_result([Iss]),
            mk_result([Edge]),
        ]
    )

    out = await GraphService(db).get_graph(uuid.uuid4())
    ids = {n["id"] for n in out["nodes"]}
    assert node_id("section", sid) in ids
    assert node_id("work_order", wid) in ids
    assert node_id("artifact", aid) in ids
    assert node_id("issue", iid) in ids
    assert len(out["edges"]) == 1
    assert out["edges"][0]["edge_type"] == "generates"


@pytest.mark.asyncio
async def test_detect_section_relationships_adds_reference_edges(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pid = uuid.uuid4()
    uid = uuid.uuid4()
    s0, s1 = uuid.uuid4(), uuid.uuid4()

    class Sec:
        def __init__(self, i: uuid.UUID, order: int) -> None:
            self.id = i
            self.title = "t"
            self.content = "see other"
            self.order = order

    secs = [Sec(s0, 0), Sec(s1, 1)]

    pr = MagicMock()
    pr.software_id = uuid.uuid4()
    sw = MagicMock()
    sw.id = pr.software_id
    sw.studio_id = uuid.uuid4()

    db = AsyncMock()
    first = MagicMock()
    first.scalars.return_value.all.return_value = secs
    db.execute = AsyncMock(return_value=first)
    db.get = AsyncMock(side_effect=[pr, sw])

    calls: list[tuple[str, str]] = []

    async def fake_add_edge(self, **kwargs):
        calls.append((kwargs["edge_type"], str(kwargs["source_id"])))

    monkeypatch.setattr(GraphService, "add_edge", fake_add_edge)

    async def fake_chat(self, **kwargs):
        return {"links": [{"from_index": 0, "to_index": 1}]}

    monkeypatch.setattr(
        "app.services.llm_service.LLMService.chat_structured",
        fake_chat,
    )

    await SectionRelationshipAgent(db, LLMService(db)).detect_section_relationships(
        pid, context_user_id=uid
    )
    assert any(c[0] == "references" for c in calls)


@pytest.mark.asyncio
async def test_detect_section_relationships_returns_early_under_two_sections(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = AsyncMock()
    first = MagicMock()
    first.scalars.return_value.all.return_value = [MagicMock()]
    db.execute = AsyncMock(return_value=first)
    llm_calls: list[object] = []

    async def track(self, **kwargs):
        llm_calls.append(1)
        return {}

    monkeypatch.setattr(
        "app.services.llm_service.LLMService.chat_structured",
        track,
    )
    await SectionRelationshipAgent(db, LLMService(db)).detect_section_relationships(
        uuid.uuid4(), context_user_id=uuid.uuid4()
    )
    assert llm_calls == []


@pytest.mark.asyncio
async def test_detect_section_relationships_swallows_llm_api_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pid = uuid.uuid4()
    uid = uuid.uuid4()
    a, b = uuid.uuid4(), uuid.uuid4()

    class Sec:
        def __init__(self, i: int) -> None:
            self.id = a if i == 0 else b
            self.title = "a"
            self.content = "x"
            self.order = i

    secs = [Sec(0), Sec(1)]
    pr = MagicMock()
    pr.software_id = uuid.uuid4()
    sw = MagicMock()
    sw.studio_id = uuid.uuid4()
    sw.id = pr.software_id

    db = AsyncMock()
    first = MagicMock()
    first.scalars.return_value.all.return_value = secs
    db.execute = AsyncMock(return_value=first)
    db.get = AsyncMock(side_effect=[pr, sw])

    async def boom(self, **kwargs):
        raise ApiError(status_code=502, code="LLM", message="x")

    monkeypatch.setattr(
        "app.services.llm_service.LLMService.chat_structured",
        boom,
    )
    await SectionRelationshipAgent(db, LLMService(db)).detect_section_relationships(
        pid, context_user_id=uid
    )
