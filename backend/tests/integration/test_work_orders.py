"""Work orders API (Slice 7)."""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import update

from app.models import WorkOrder


async def _register(client: AsyncClient, suffix: str, label: str) -> str:
    r = await client.post(
        "/auth/register",
        json={
            "email": f"{label}-{suffix}@example.com",
            "password": "securepass123",
            "display_name": label,
        },
    )
    assert r.status_code == 200, r.text
    token = r.cookies.get("atelier_token")
    assert token
    return token


async def _studio_project_with_sections(
    client: AsyncClient, sfx: str
) -> tuple[str, str, str, str, str, str]:
    """Returns token_admin, studio_id, software_id, project_id, section_a_id, section_b_id."""
    token = await _register(client, sfx, "owner")
    client.cookies.set("atelier_token", token)
    cr = await client.post("/studios", json={"name": f"S{sfx}", "description": "d"})
    assert cr.status_code == 200
    studio_id = cr.json()["id"]
    sw = await client.post(
        f"/studios/{studio_id}/software",
        json={"name": "SW", "description": None, "definition": "App does X."},
    )
    assert sw.status_code == 200
    software_id = sw.json()["id"]
    pr = await client.post(
        f"/software/{software_id}/projects",
        json={"name": "Proj", "description": None},
    )
    assert pr.status_code == 200
    project_id = pr.json()["id"]
    sa = await client.post(
        f"/projects/{project_id}/sections",
        json={"title": "Alpha", "slug": "sec-alpha"},
    )
    assert sa.status_code == 200
    section_a_id = sa.json()["id"]
    sb = await client.post(
        f"/projects/{project_id}/sections",
        json={"title": "Beta", "slug": "sec-beta"},
    )
    assert sb.status_code == 200
    section_b_id = sb.json()["id"]
    return token, studio_id, software_id, project_id, section_a_id, section_b_id


@pytest.mark.asyncio
async def test_work_orders_crud_notes_rbac(
    client: AsyncClient,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, studio_id, _software_id, pid, sec_a, _sec_b = (
        await _studio_project_with_sections(client, sfx)
    )

    member_token = await _register(client, sfx, "member")
    client.cookies.set("atelier_token", token)
    madd = await client.post(
        f"/studios/{studio_id}/members",
        json={"email": f"member-{sfx}@example.com", "role": "studio_member"},
    )
    assert madd.status_code == 200, madd.text

    client.cookies.set("atelier_token", member_token)
    create = await client.post(
        f"/projects/{pid}/work-orders",
        json={
            "title": "WO1",
            "description": "Do the thing",
            "status": "backlog",
            "section_ids": [sec_a],
        },
    )
    assert create.status_code == 200, create.text
    wid = create.json()["id"]
    assert sec_a in create.json()["section_ids"]

    lst = await client.get(f"/projects/{pid}/work-orders")
    assert lst.status_code == 200
    assert len(lst.json()) == 1

    det = await client.get(f"/projects/{pid}/work-orders/{wid}")
    assert det.status_code == 200
    assert det.json()["notes"] == []

    note = await client.post(
        f"/projects/{pid}/work-orders/{wid}/notes",
        json={"content": "hello note"},
    )
    assert note.status_code == 200
    assert note.json()["content"] == "hello note"

    det2 = await client.get(f"/projects/{pid}/work-orders/{wid}")
    assert len(det2.json()["notes"]) == 1

    put = await client.put(
        f"/projects/{pid}/work-orders/{wid}",
        json={"status": "in_progress", "phase": "phase-1"},
    )
    assert put.status_code == 200
    assert put.json()["status"] == "in_progress"

    client.cookies.set("atelier_token", await _register(client, sfx, "outsider"))
    forbidden = await client.get(f"/projects/{pid}/work-orders")
    assert forbidden.status_code == 403


@pytest.mark.asyncio
async def test_work_orders_dismiss_stale(
    client: AsyncClient,
    db_session,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _studio_id, _software_id, pid, sec_a, _sec_b = (
        await _studio_project_with_sections(client, sfx)
    )
    client.cookies.set("atelier_token", token)
    cr = await client.post(
        f"/projects/{pid}/work-orders",
        json={"title": "W", "description": "D", "section_ids": [sec_a]},
    )
    assert cr.status_code == 200
    wid = cr.json()["id"]

    await db_session.execute(
        update(WorkOrder)
        .where(WorkOrder.id == uuid.UUID(wid))
        .values(is_stale=True, stale_reason="spec changed")
    )
    await db_session.flush()

    dismiss = await client.post(
        f"/projects/{pid}/work-orders/{wid}/dismiss-stale",
    )
    assert dismiss.status_code == 200
    assert dismiss.json()["is_stale"] is False

    det = await client.get(f"/projects/{pid}/work-orders/{wid}")
    assert det.json()["is_stale"] is False


@pytest.mark.asyncio
async def test_work_orders_generate_mocked(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _studio_id, _software_id, pid, sec_a, _sec_b = (
        await _studio_project_with_sections(client, sfx)
    )
    client.cookies.set("atelier_token", token)

    async def fake_chat_structured(self, **kwargs):
        return {
            "items": [
                {
                    "title": "Generated",
                    "description": "Generated desc",
                    "implementation_guide": "ig",
                    "acceptance_criteria": "ac",
                    "linked_section_slugs": ["sec-alpha"],
                }
            ],
        }

    monkeypatch.setattr(
        "app.services.llm_service.LLMService.chat_structured",
        fake_chat_structured,
    )

    gen = await client.post(
        f"/projects/{pid}/work-orders/generate",
        json={"section_ids": [sec_a]},
    )
    assert gen.status_code == 201, gen.text
    body = gen.json()
    assert len(body) == 1
    assert body[0]["title"] == "Generated"
    wid = body[0]["id"]

    det = await client.get(f"/projects/{pid}/work-orders/{wid}")
    assert sec_a in det.json()["section_ids"]


@pytest.mark.asyncio
async def test_create_work_order_requires_section(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _s, _sw, pid, sec_a, _sec_b = await _studio_project_with_sections(
        client, sfx
    )
    client.cookies.set("atelier_token", token)
    r = await client.post(
        f"/projects/{pid}/work-orders",
        json={
            "title": "T",
            "description": "D",
            "section_ids": [],
        },
    )
    assert r.status_code == 422
    assert r.json()["code"] == "SECTION_REQUIRED"


@pytest.mark.asyncio
async def test_generate_skips_unknown_slug(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _s, _sw, pid, sec_a, _sec_b = await _studio_project_with_sections(
        client, sfx
    )
    client.cookies.set("atelier_token", token)

    async def fake_chat_structured(self, **kwargs):
        return {
            "items": [
                {
                    "title": "Slugs",
                    "description": "Desc",
                    "implementation_guide": None,
                    "acceptance_criteria": None,
                    "linked_section_slugs": ["nonexistent-slug"],
                }
            ],
        }

    monkeypatch.setattr(
        "app.services.llm_service.LLMService.chat_structured",
        fake_chat_structured,
    )
    gen = await client.post(
        f"/projects/{pid}/work-orders/generate",
        json={"section_ids": [sec_a]},
    )
    assert gen.status_code == 201, gen.text
    body = gen.json()
    assert len(body) == 1
    assert body[0]["section_ids"] == []


@pytest.mark.asyncio
async def test_viewer_cannot_mutate_work_orders(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, studio_id, _sw, pid, sec_a, _sec_b = await _studio_project_with_sections(
        client, sfx
    )
    viewer_tok = await _register(client, sfx, "vieweru")
    client.cookies.set("atelier_token", token)
    addm = await client.post(
        f"/studios/{studio_id}/members",
        json={"email": f"vieweru-{sfx}@example.com", "role": "studio_viewer"},
    )
    assert addm.status_code == 200, addm.text
    # owner creates one WO to target for PUT/DELETE
    c = await client.post(
        f"/projects/{pid}/work-orders",
        json={"title": "T", "description": "D", "section_ids": [sec_a]},
    )
    assert c.status_code == 200, c.text
    wid = c.json()["id"]

    client.cookies.set("atelier_token", viewer_tok)
    assert (
        await client.post(
            f"/projects/{pid}/work-orders",
            json={"title": "X", "description": "Y", "section_ids": [sec_a]},
        )
    ).status_code == 403
    assert (
        await client.put(
            f"/projects/{pid}/work-orders/{wid}",
            json={"title": "Z"},
        )
    ).status_code == 403
    assert (
        await client.delete(f"/projects/{pid}/work-orders/{wid}")
    ).status_code == 403
    assert (
        await client.post(
            f"/projects/{pid}/work-orders/generate",
            json={"section_ids": [sec_a]},
        )
    ).status_code == 403


@pytest.mark.asyncio
async def test_all_valid_statuses_accepted(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, studio_id, _sw, pid, sec_a, _sec_b = await _studio_project_with_sections(
        client, sfx
    )
    member_tok = await _register(client, sfx, "mstat")
    client.cookies.set("atelier_token", token)
    madd = await client.post(
        f"/studios/{studio_id}/members",
        json={"email": f"mstat-{sfx}@example.com", "role": "studio_member"},
    )
    assert madd.status_code == 200, madd.text
    client.cookies.set("atelier_token", member_tok)
    c = await client.post(
        f"/projects/{pid}/work-orders",
        json={"title": "S", "description": "D", "section_ids": [sec_a]},
    )
    assert c.status_code == 200, c.text
    wid = c.json()["id"]
    for st, expect in [
        ("in_review", "in_review"),
        ("done", "done"),
        ("archived", "archived"),
    ]:
        p = await client.put(
            f"/projects/{pid}/work-orders/{wid}",
            json={"status": st},
        )
        assert p.status_code == 200, p.text
        assert p.json()["status"] == expect


@pytest.mark.asyncio
async def test_delete_removes_work_order_sections(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _st, _sw, pid, sec_a, _sec_b = await _studio_project_with_sections(
        client, sfx
    )
    client.cookies.set("atelier_token", token)
    c = await client.post(
        f"/projects/{pid}/work-orders",
        json={"title": "T", "description": "D", "section_ids": [sec_a]},
    )
    assert c.status_code == 200, c.text
    wid = c.json()["id"]
    d = await client.delete(f"/projects/{pid}/work-orders/{wid}")
    assert d.status_code == 204
    lst = await client.get(f"/projects/{pid}/work-orders")
    assert lst.status_code == 200
    assert all(row["id"] != wid for row in lst.json())
