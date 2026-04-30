"""Integration tests for project issues and conflict analysis (mocked LLM)."""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient

from tests.integration.test_work_orders import _register, _studio_project_with_sections


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
async def test_member_cannot_update_issue_owned_by_another_actor(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token_owner, studio_id, _sw, pid, _a, _b = (
        await _studio_project_with_sections(client, sfx)
    )
    member_token = await _register(client, sfx, "member2")
    client.cookies.set("atelier_token", token_owner)
    invite = await client.post(
        f"/studios/{studio_id}/members",
        json={
            "email": f"member2-{sfx}@example.com",
            "role": "studio_member",
        },
    )
    assert invite.status_code == 200

    async def fake_chat_structured(self, **kwargs):
        return {
            "findings": [
                {
                    "finding_type": "pair_conflict",
                    "section_index_a": 0,
                    "section_index_b": 1,
                    "description": "Mismatch.",
                }
            ]
        }

    monkeypatch.setattr(
        "app.services.llm_service.LLMService.chat_structured",
        fake_chat_structured,
    )

    analyze = await client.post(f"/projects/{pid}/analyze")
    assert analyze.status_code == 200
    rows = (await client.get(f"/projects/{pid}/issues")).json()
    issue_id = rows[0]["id"]

    client.cookies.set("atelier_token", member_token)
    forbidden = await client.put(
        f"/projects/{pid}/issues/{issue_id}",
        json={"status": "resolved"},
    )
    assert forbidden.status_code == 403


@pytest.mark.asyncio
async def test_put_issue_not_found(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _sid, _sw, pid, _a, _b = await _studio_project_with_sections(
        client, sfx
    )
    client.cookies.set("atelier_token", token)
    bogus = uuid.uuid4()
    r = await client.put(
        f"/projects/{pid}/issues/{bogus}",
        json={"status": "resolved"},
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_issues_routes_require_auth(client: AsyncClient) -> None:
    pid = str(uuid.uuid4())
    r0 = await client.get(f"/projects/{pid}/issues")
    assert r0.status_code == 401
    r1 = await client.post(f"/projects/{pid}/analyze")
    assert r1.status_code == 401
