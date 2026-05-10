"""Work orders API (Slice 7)."""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import WorkOrder
from tests.integration.studio_http_seed import post_admin_studio


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
    client: AsyncClient, db_session: AsyncSession, sfx: str
) -> tuple[str, str, str, str, str, str]:
    """Returns token_admin, studio_id, software_id, project_id, section_a_id, section_b_id."""
    token = await _register(client, sfx, "owner")
    client.cookies.set("atelier_token", token)
    owner_email = f"owner-{sfx}@example.com"
    cr = await post_admin_studio(
        client,
        db_session,
        user_email=owner_email,
        json_body={"name": f"S{sfx}", "description": "d"},
    )
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
    db_session: AsyncSession,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, studio_id, _software_id, pid, sec_a, _sec_b = (
        await _studio_project_with_sections(client, db_session, sfx)
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
        await _studio_project_with_sections(client, db_session, sfx)
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
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _studio_id, _software_id, pid, sec_a, _sec_b = (
        await _studio_project_with_sections(client, db_session, sfx)
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
async def test_create_work_order_requires_section(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _s, _sw, pid, sec_a, _sec_b = await _studio_project_with_sections(
        client, db_session, sfx
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
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _s, _sw, pid, sec_a, _sec_b = await _studio_project_with_sections(
        client, db_session, sfx
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
async def test_update_work_order_rejects_empty_section_ids(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _st, _sw, pid, sec_a, _sec_b = await _studio_project_with_sections(
        client, db_session, sfx
    )
    client.cookies.set("atelier_token", token)
    c = await client.post(
        f"/projects/{pid}/work-orders",
        json={"title": "T", "description": "D", "section_ids": [sec_a]},
    )
    assert c.status_code == 200, c.text
    wid = c.json()["id"]
    u = await client.put(
        f"/projects/{pid}/work-orders/{wid}",
        json={"section_ids": []},
    )
    assert u.status_code == 422
    assert u.json()["code"] == "SECTION_REQUIRED"


@pytest.mark.asyncio
async def test_viewer_cannot_mutate_work_orders(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, studio_id, _sw, pid, sec_a, _sec_b = await _studio_project_with_sections(
        client, db_session, sfx
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
    # Owner adds second WO for viewer apply RBAC check
    client.cookies.set("atelier_token", token)
    c2 = await client.post(
        f"/projects/{pid}/work-orders",
        json={"title": "T2", "description": "D2", "section_ids": [sec_a]},
    )
    assert c2.status_code == 200, c2.text
    wid2 = c2.json()["id"]

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
    assert (
        await client.post(f"/projects/{pid}/work-orders/dedupe/analyze")
    ).status_code == 403
    assert (
        await client.post(
            f"/projects/{pid}/work-orders/dedupe/apply",
            json={
                "keep_work_order_id": wid,
                "archive_work_order_ids": [wid2],
                "merged_fields": {"title": "Combined", "description": "One"},
            },
        )
    ).status_code == 403


@pytest.mark.asyncio
async def test_all_valid_statuses_accepted(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, studio_id, _sw, pid, sec_a, _sec_b = await _studio_project_with_sections(
        client, db_session, sfx
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
async def test_delete_removes_work_order_sections(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _st, _sw, pid, sec_a, _sec_b = await _studio_project_with_sections(
        client, db_session, sfx
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


@pytest.mark.asyncio
async def test_dedupe_analyze_without_backlog_skips_llm(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _studio_id, _software_id, pid, _sec_a, _sec_b = (
        await _studio_project_with_sections(client, db_session, sfx)
    )
    client.cookies.set("atelier_token", token)

    async def boom(self, **kwargs: object) -> dict[str, object]:
        raise AssertionError("LLM should not run without backlog")

    monkeypatch.setattr(
        "app.services.llm_service.LLMService.chat_structured",
        boom,
    )

    r = await client.post(f"/projects/{pid}/work-orders/dedupe/analyze")
    assert r.status_code == 200, r.text
    assert r.json()["groups"] == []


@pytest.mark.asyncio
async def test_dedupe_analyze_mocked_and_apply_merge(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _studio_id, _software_id, pid, sec_a, _sec_b = (
        await _studio_project_with_sections(client, db_session, sfx)
    )
    client.cookies.set("atelier_token", token)

    c1 = await client.post(
        f"/projects/{pid}/work-orders",
        json={
            "title": "Alpha task",
            "description": "First",
            "section_ids": [sec_a],
        },
    )
    assert c1.status_code == 200, c1.text
    wid1 = c1.json()["id"]
    c2 = await client.post(
        f"/projects/{pid}/work-orders",
        json={
            "title": "Beta task",
            "description": "Second",
            "section_ids": [sec_a],
        },
    )
    assert c2.status_code == 200, c2.text
    wid2 = c2.json()["id"]

    async def fake_chat_structured(self, **kwargs: object) -> dict[str, object]:
        return {
            "groups": [
                {
                    "work_order_ids": [wid1, wid2],
                    "rationale": "Overlapping scope.",
                    "suggested_combined": {
                        "title": "Merged title",
                        "description": "Merged description",
                        "implementation_guide": "ig",
                        "acceptance_criteria": "ac",
                    },
                }
            ],
        }

    monkeypatch.setattr(
        "app.services.llm_service.LLMService.chat_structured",
        fake_chat_structured,
    )

    r = await client.post(f"/projects/{pid}/work-orders/dedupe/analyze")
    assert r.status_code == 200, r.text
    groups = r.json()["groups"]
    assert len(groups) == 1
    assert groups[0]["rationale"] == "Overlapping scope."
    assert wid1 in groups[0]["work_order_ids"]
    assert wid2 in groups[0]["work_order_ids"]

    apply_r = await client.post(
        f"/projects/{pid}/work-orders/dedupe/apply",
        json={
            "keep_work_order_id": wid1,
            "archive_work_order_ids": [wid2],
            "merged_fields": {
                "title": "Applied merged title",
                "description": "Applied merged description",
                "implementation_guide": None,
                "acceptance_criteria": None,
            },
        },
    )
    assert apply_r.status_code == 200, apply_r.text
    kept = apply_r.json()
    assert kept["title"] == "Applied merged title"
    assert kept["status"] == "backlog"

    lst = await client.get(f"/projects/{pid}/work-orders")
    rows = lst.json()
    by_id = {row["id"]: row for row in rows}
    assert by_id[wid2]["status"] == "archived"

    det = await client.get(f"/projects/{pid}/work-orders/{wid1}")
    notes = det.json()["notes"]
    assert any("Merged duplicate backlog" in n["content"] for n in notes)


@pytest.mark.asyncio
async def test_dedupe_analyze_requires_auth(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    sfx = uuid.uuid4().hex[:8]
    _token, _studio_id, _software_id, pid, _sec_a, _sec_b = (
        await _studio_project_with_sections(client, db_session, sfx)
    )
    client.cookies.clear()
    r = await client.post(f"/projects/{pid}/work-orders/dedupe/analyze")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_dedupe_analyze_unknown_project(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _studio_id, _software_id, _pid, _sec_a, _sec_b = (
        await _studio_project_with_sections(client, db_session, sfx)
    )
    client.cookies.set("atelier_token", token)
    fake_pid = str(uuid.uuid4())
    r = await client.post(f"/projects/{fake_pid}/work-orders/dedupe/analyze")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_dedupe_apply_invalid_keep_in_archive(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _studio_id, _software_id, pid, sec_a, _sec_b = (
        await _studio_project_with_sections(client, db_session, sfx)
    )
    client.cookies.set("atelier_token", token)
    c1 = await client.post(
        f"/projects/{pid}/work-orders",
        json={
            "title": "A",
            "description": "d",
            "section_ids": [sec_a],
        },
    )
    wid = c1.json()["id"]
    r = await client.post(
        f"/projects/{pid}/work-orders/dedupe/apply",
        json={
            "keep_work_order_id": wid,
            "archive_work_order_ids": [wid],
            "merged_fields": {"title": "T", "description": "D"},
        },
    )
    assert r.status_code == 422
    assert r.json()["code"] == "INVALID_MERGE"


@pytest.mark.asyncio
async def test_dedupe_apply_target_not_backlog(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _studio_id, _software_id, pid, sec_a, _sec_b = (
        await _studio_project_with_sections(client, db_session, sfx)
    )
    client.cookies.set("atelier_token", token)
    c1 = await client.post(
        f"/projects/{pid}/work-orders",
        json={
            "title": "A",
            "description": "d",
            "section_ids": [sec_a],
        },
    )
    wid1 = c1.json()["id"]
    c2 = await client.post(
        f"/projects/{pid}/work-orders",
        json={
            "title": "B",
            "description": "d",
            "section_ids": [sec_a],
        },
    )
    wid2 = c2.json()["id"]
    up = await client.put(
        f"/projects/{pid}/work-orders/{wid2}",
        json={"status": "in_progress"},
    )
    assert up.status_code == 200
    r = await client.post(
        f"/projects/{pid}/work-orders/dedupe/apply",
        json={
            "keep_work_order_id": wid1,
            "archive_work_order_ids": [wid2],
            "merged_fields": {"title": "T", "description": "D"},
        },
    )
    assert r.status_code == 422
    assert r.json()["code"] == "INVALID_MERGE"


@pytest.mark.asyncio
async def test_outsider_dedupe_analyze_forbidden(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _studio_id, _software_id, pid, _sec_a, _sec_b = (
        await _studio_project_with_sections(client, db_session, sfx)
    )
    client.cookies.set("atelier_token", token)
    outsider_tok = await _register(client, sfx, "outsiderd")
    client.cookies.set("atelier_token", outsider_tok)
    r = await client.post(f"/projects/{pid}/work-orders/dedupe/analyze")
    assert r.status_code == 403
