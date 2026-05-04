"""Outline editor APIs: health, citation health, context preferences, issue counts."""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient

from tests.integration.test_projects import _studio_with_software
from tests.integration.test_work_orders import _studio_project_with_sections


@pytest.mark.asyncio
async def test_list_sections_includes_open_issue_count(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _studio_id, software_id, pid, sec_a, sec_b = (
        await _studio_project_with_sections(client, sfx)
    )
    client.cookies.set("atelier_token", token)

    async def fake_chat_structured(self, **kwargs):
        return {
            "findings": [
                {
                    "finding_type": "section_gap",
                    "section_index_a": 0,
                    "description": "Missing detail on Alpha.",
                }
            ]
        }

    monkeypatch.setattr(
        "app.services.llm_service.LLMService.chat_structured",
        fake_chat_structured,
    )
    ar = await client.post(f"/projects/{pid}/analyze")
    assert ar.status_code == 200, ar.text

    lr = await client.get(f"/projects/{pid}/sections")
    assert lr.status_code == 200, lr.text
    rows = lr.json()
    by_id = {r["id"]: r for r in rows}
    assert by_id[sec_a]["open_issue_count"] >= 1
    assert by_id[sec_b]["open_issue_count"] == 0


@pytest.mark.asyncio
async def test_list_sections_include_outline_health(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _studio_id, software_id, pid, sec_a, sec_b = (
        await _studio_project_with_sections(client, sfx)
    )
    client.cookies.set("atelier_token", token)

    async def fake_build_context_with_blocks(
        self,
        q: str,
        project_id: uuid.UUID,
        section_id: uuid.UUID,
        **kwargs: object,
    ):
        from app.schemas.context_preview import ContextPreviewOut

        _ = (q, project_id, section_id, kwargs)
        return ContextPreviewOut(
            blocks=[],
            total_tokens=42,
            budget_tokens=6000,
            overflow_strategy_applied=None,
            debug_raw_rag_text=None,
        )

    monkeypatch.setattr(
        "app.services.rag_service.RAGService.build_context_with_blocks",
        fake_build_context_with_blocks,
    )

    lr = await client.get(
        f"/projects/{pid}/sections?include_outline_health=true",
    )
    assert lr.status_code == 200, lr.text
    rows = lr.json()
    by_id = {r["id"]: r for r in rows}
    for sid in (sec_a, sec_b):
        oh = by_id[sid].get("outline_health")
        assert isinstance(oh, dict), by_id[sid]
        assert oh["drift_count"] == 0
        assert oh["gap_count"] >= 0
        assert oh["token_used"] == 42
        assert oh["token_budget"] == 6000
        assert oh["citation_scan_pending"] is True


@pytest.mark.asyncio
async def test_section_health_uses_mocked_citation(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _studio_id, software_id = await _studio_with_software(client, sfx)
    client.cookies.set("atelier_token", token)
    pr = await client.post(
        f"/software/{software_id}/projects",
        json={"name": "P1", "description": None},
    )
    assert pr.status_code == 200, pr.text
    pid = pr.json()["id"]
    s1 = await client.post(
        f"/projects/{pid}/sections",
        json={"title": "A", "content": "Hello world " * 10},
    )
    assert s1.status_code == 200, s1.text
    sid = s1.json()["id"]

    async def fake_analyze(
        self: object,
        *,
        project_id: uuid.UUID,
        section_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> object:
        from app.schemas.citation_health import CitationHealthOut

        return CitationHealthOut(
            citations_resolved=2,
            citations_missing=1,
            missing_items=[],
        )

    monkeypatch.setattr(
        "app.services.section_health_service.CitationHealthService.analyze_section",
        fake_analyze,
    )

    hr = await client.get(f"/projects/{pid}/sections/{sid}/health")
    assert hr.status_code == 200, hr.text
    body = hr.json()
    assert body["drift_count"] == 0
    assert body["gap_count"] == 0
    assert body["citations_resolved"] == 2
    assert body["citations_missing"] == 1
    assert body["token_used"] >= 0
    assert body["token_budget"] == 6000
    assert body["drawer_drift"] is not None


@pytest.mark.asyncio
async def test_context_preferences_patch_roundtrip(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _studio_id, software_id = await _studio_with_software(client, sfx)
    client.cookies.set("atelier_token", token)
    pr = await client.post(
        f"/software/{software_id}/projects",
        json={"name": "P1", "description": None},
    )
    assert pr.status_code == 200, pr.text
    pid = pr.json()["id"]
    s1 = await client.post(f"/projects/{pid}/sections", json={"title": "A"})
    assert s1.status_code == 200, s1.text
    sid = s1.json()["id"]

    gr = await client.get(f"/projects/{pid}/sections/{sid}/context-preferences")
    assert gr.status_code == 200, gr.text
    assert gr.json()["excluded_kinds"] == []

    pr2 = await client.patch(
        f"/projects/{pid}/sections/{sid}/context-preferences",
        json={"excluded_kinds": ["git_history"]},
    )
    assert pr2.status_code == 200, pr2.text
    assert pr2.json()["excluded_kinds"] == ["git_history"]


@pytest.mark.asyncio
async def test_section_health_401(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _studio_id, software_id = await _studio_with_software(client, sfx)
    client.cookies.set("atelier_token", token)
    pr = await client.post(
        f"/software/{software_id}/projects",
        json={"name": "P1", "description": None},
    )
    pid = pr.json()["id"]
    s1 = await client.post(f"/projects/{pid}/sections", json={"title": "A"})
    sid = s1.json()["id"]
    client.cookies.delete("atelier_token")
    r = await client.get(f"/projects/{pid}/sections/{sid}/health")
    assert r.status_code == 401
