"""Integration tests for project issues and conflict analysis (mocked LLM)."""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient

from tests.integration.test_work_orders import _studio_project_with_sections


@pytest.mark.asyncio
async def test_analyze_creates_issues_and_lists(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _sid, _sw, pid, sec_a, sec_b = await _studio_project_with_sections(
        client, sfx
    )
    client.cookies.set("atelier_token", token)

    async def fake_chat_structured(self, **kwargs):
        return {
            "findings": [
                {
                    "finding_type": "pair_conflict",
                    "section_index_a": 0,
                    "section_index_b": 1,
                    "description": "Contradiction between Alpha and Beta.",
                }
            ]
        }

    monkeypatch.setattr(
        "app.services.llm_service.LLMService.chat_structured",
        fake_chat_structured,
    )

    ar = await client.post(f"/projects/{pid}/analyze")
    assert ar.status_code == 200, ar.text
    assert ar.json().get("issues_created") == 1

    lr = await client.get(f"/projects/{pid}/issues")
    assert lr.status_code == 200
    rows = lr.json()
    assert len(rows) >= 1
    issue_id = rows[0]["id"]

    up = await client.put(
        f"/projects/{pid}/issues/{issue_id}",
        json={"status": "resolved"},
    )
    assert up.status_code == 200
    assert up.json()["status"] == "resolved"


@pytest.mark.asyncio
async def test_issues_routes_require_auth(client: AsyncClient) -> None:
    pid = str(uuid.uuid4())
    r0 = await client.get(f"/projects/{pid}/issues")
    assert r0.status_code == 401
    r1 = await client.post(f"/projects/{pid}/analyze")
    assert r1.status_code == 401
