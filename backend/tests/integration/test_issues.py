"""Integration tests for project issues and conflict analysis (mocked LLM)."""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.integration.test_work_orders import _register, _studio_project_with_sections


@pytest.mark.asyncio
async def test_analyze_creates_issues_and_lists(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    db_session: AsyncSession,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _sid, _sw, pid, sec_a, sec_b = await _studio_project_with_sections(
        client, db_session, sfx
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

    filtered = await client.get(
        f"/projects/{pid}/issues",
        params={"section_id": sec_a},
    )
    assert filtered.status_code == 200
    rows_f = filtered.json()
    assert len(rows_f) >= 1
    assert all(
        r["section_a_id"] == sec_a or r["section_b_id"] == sec_a
        for r in rows_f
    )


@pytest.mark.asyncio
async def test_member_cannot_update_issue_owned_by_another_actor(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    db_session: AsyncSession,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token_owner, studio_id, _sw, pid, _a, _b = (
        await _studio_project_with_sections(client, db_session, sfx)
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
async def test_non_admin_member_lists_only_own_actor_issues(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    db_session: AsyncSession,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token_owner, studio_id, _sw, pid, _a, _b = await _studio_project_with_sections(
        client, db_session, sfx
    )
    member_token = await _register(client, sfx, "list_member")
    client.cookies.set("atelier_token", token_owner)
    invite = await client.post(
        f"/studios/{studio_id}/members",
        json={
            "email": f"list_member-{sfx}@example.com",
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
                    "description": "Other actor only.",
                }
            ]
        }

    monkeypatch.setattr(
        "app.services.llm_service.LLMService.chat_structured",
        fake_chat_structured,
    )

    analyze = await client.post(f"/projects/{pid}/analyze")
    assert analyze.status_code == 200

    client.cookies.set("atelier_token", member_token)
    lr = await client.get(f"/projects/{pid}/issues")
    assert lr.status_code == 200
    assert lr.json() == []


@pytest.mark.asyncio
async def test_put_issue_wrong_project_id_returns_404(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    db_session: AsyncSession,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _sid, sw, pid1, _a, _b = await _studio_project_with_sections(client, db_session, sfx)
    client.cookies.set("atelier_token", token)
    pr2 = await client.post(
        f"/software/{sw}/projects",
        json={"name": "P2", "description": None},
    )
    assert pr2.status_code == 200
    pid2 = pr2.json()["id"]

    async def fake_chat_structured(self, **kwargs):
        return {
            "findings": [
                {
                    "finding_type": "pair_conflict",
                    "section_index_a": 0,
                    "section_index_b": 1,
                    "description": "Scoped to P1.",
                }
            ]
        }

    monkeypatch.setattr(
        "app.services.llm_service.LLMService.chat_structured",
        fake_chat_structured,
    )
    await client.post(f"/projects/{pid1}/analyze")
    rows = (await client.get(f"/projects/{pid1}/issues")).json()
    issue_id = rows[0]["id"]

    bad = await client.put(
        f"/projects/{pid2}/issues/{issue_id}",
        json={"status": "resolved"},
    )
    assert bad.status_code == 404


@pytest.mark.asyncio
async def test_put_issue_not_found(client: AsyncClient, db_session: AsyncSession) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _sid, _sw, pid, _a, _b = await _studio_project_with_sections(
        client, db_session, sfx
    )
    client.cookies.set("atelier_token", token)
    bogus = uuid.uuid4()
    r = await client.put(
        f"/projects/{pid}/issues/{bogus}",
        json={"status": "resolved"},
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_issues_routes_require_auth(client: AsyncClient, db_session: AsyncSession) -> None:
    pid = str(uuid.uuid4())
    r0 = await client.get(f"/projects/{pid}/issues")
    assert r0.status_code == 401
    r1 = await client.post(f"/projects/{pid}/analyze")
    assert r1.status_code == 401
