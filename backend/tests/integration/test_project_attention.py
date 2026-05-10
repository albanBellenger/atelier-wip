"""Integration tests for GET /projects/{id}/attention."""

from __future__ import annotations

import uuid

import pytest
from tests.integration.studio_http_seed import post_admin_studio
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User, WorkOrder
from tests.integration.test_work_orders import _register, _studio_project_with_sections


async def _promote_tool_admin(db_session: AsyncSession, email: str) -> None:
    r = await db_session.execute(select(User).where(User.email == email))
    u = r.scalar_one()
    u.is_platform_admin = True
    await db_session.flush()


@pytest.mark.asyncio
async def test_attention_unauthorized(client: AsyncClient, db_session: AsyncSession) -> None:
    r = await client.get(f"/projects/{uuid.uuid4()}/attention")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_attention_outsider_forbidden(client: AsyncClient, db_session: AsyncSession) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _sid, _sw, pid, _a, _b = await _studio_project_with_sections(client, db_session, sfx)
    client.cookies.set("atelier_token", token)
    outsider = await _register(client, sfx, "outsider")
    client.cookies.set("atelier_token", outsider)
    r = await client.get(f"/projects/{pid}/attention")
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_attention_cross_studio_viewer_forbidden(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token_ta = await _register(client, sfx, "taat")
    await _promote_tool_admin(db_session, f"taat-{sfx}@example.com")
    client.cookies.set("atelier_token", token_ta)
    studio_a = (
        await post_admin_studio(client, db_session, user_email=f"taat-{sfx}@example.com", json_body={"name": f"AAT{sfx}", "description": ""})
    ).json()["id"]
    sw_id = (
        await client.post(
            f"/studios/{studio_a}/software",
            json={"name": f"SWAT{sfx}", "description": ""},
        )
    ).json()["id"]
    proj_id = (
        await client.post(
            f"/software/{sw_id}/projects",
            json={"name": f"PAT{sfx}", "description": ""},
        )
    ).json()["id"]
    await client.post(
        f"/projects/{proj_id}/sections",
        json={"title": "S", "slug": "s1"},
    )

    token_b = await _register(client, sfx, "adminat")
    client.cookies.set("atelier_token", token_b)
    studio_b = (
        await post_admin_studio(client, db_session, user_email=f"adminat-{sfx}@example.com", json_body={"name": f"BAT{sfx}", "description": ""})
    ).json()["id"]

    token_m = await _register(client, sfx, "viewat")
    client.cookies.set("atelier_token", token_b)
    inv = await client.post(
        f"/studios/{studio_b}/members",
        json={"email": f"viewat-{sfx}@example.com", "role": "studio_member"},
    )
    assert inv.status_code == 200

    req = await client.post(
        f"/studios/{studio_b}/cross-studio-request",
        json={"target_software_id": sw_id, "requested_access_level": "viewer"},
    )
    assert req.status_code == 200
    grant_id = req.json()["id"]

    client.cookies.set("atelier_token", token_ta)
    apr = await client.put(
        f"/studios/{studio_a}/cross-studio-incoming/{grant_id}",
        json={"decision": "approve", "access_level": "viewer"},
    )
    assert apr.status_code == 200

    client.cookies.set("atelier_token", token_m)
    r = await client.get(f"/projects/{proj_id}/attention")
    assert r.status_code == 403
    assert r.json().get("code") == "FORBIDDEN"


@pytest.mark.asyncio
async def test_attention_conflict_drift_update_counts(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    db_session,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token_owner, studio_id, _sw, pid, sec_a, sec_b = (
        await _studio_project_with_sections(client, db_session, sfx)
    )
    member_token = await _register(client, sfx, "memat")
    client.cookies.set("atelier_token", token_owner)
    inv = await client.post(
        f"/studios/{studio_id}/members",
        json={"email": f"memat-{sfx}@example.com", "role": "studio_member"},
    )
    assert inv.status_code == 200

    async def fake_chat_structured(self, **kwargs):
        return {
            "findings": [
                {
                    "finding_type": "pair_conflict",
                    "section_index_a": 0,
                    "section_index_b": 1,
                    "description": "Alpha vs Beta mismatch.",
                },
                {
                    "finding_type": "section_gap",
                    "section_index_a": 0,
                    "section_index_b": None,
                    "description": "Missing detail in Alpha.",
                },
            ],
        }

    monkeypatch.setattr(
        "app.services.llm_service.LLMService.chat_structured",
        fake_chat_structured,
    )
    ar = await client.post(f"/projects/{pid}/analyze")
    assert ar.status_code == 200, ar.text

    client.cookies.set("atelier_token", member_token)
    cr = await client.post(
        f"/projects/{pid}/work-orders",
        json={
            "title": "Shared WO",
            "description": "Do work",
            "status": "backlog",
            "section_ids": [sec_a],
        },
    )
    assert cr.status_code == 200
    wid_stale = cr.json()["id"]

    await db_session.execute(
        update(WorkOrder)
        .where(WorkOrder.id == uuid.UUID(wid_stale))
        .values(is_stale=True, stale_reason="Spec moved under you.")
    )
    await db_session.flush()

    client.cookies.set("atelier_token", token_owner)
    cr2 = await client.post(
        f"/projects/{pid}/work-orders",
        json={
            "title": "Owner WO",
            "description": "Original",
            "status": "backlog",
            "section_ids": [sec_a],
        },
    )
    assert cr2.status_code == 200
    wid_peer = cr2.json()["id"]

    client.cookies.set("atelier_token", member_token)
    put = await client.put(
        f"/projects/{pid}/work-orders/{wid_peer}",
        json={"description": "Changed by member"},
    )
    assert put.status_code == 200
    assert put.json().get("updated_by_id") is not None

    client.cookies.set("atelier_token", token_owner)
    att = await client.get(f"/projects/{pid}/attention")
    assert att.status_code == 200, att.text
    body = att.json()
    assert body["project_id"] == pid
    assert body["counts"]["conflict"] >= 1
    assert body["counts"]["gap"] >= 1
    assert body["counts"]["drift"] >= 1
    assert body["counts"]["update"] >= 1
    kinds = {item["kind"] for item in body["items"]}
    assert "conflict" in kinds
    assert "gap" in kinds
    assert "drift" in kinds
    assert "update" in kinds

    client.cookies.set("atelier_token", member_token)
    att_m = await client.get(f"/projects/{pid}/attention")
    assert att_m.status_code == 200
    assert att_m.json()["counts"]["update"] == 0
