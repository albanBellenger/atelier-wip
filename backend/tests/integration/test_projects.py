"""Slice 3: projects API."""

import uuid

import pytest
from httpx import AsyncClient


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


async def _studio_with_software(client: AsyncClient, sfx: str) -> tuple[str, str, str]:
    """Returns (token_admin, studio_id, software_id)."""
    token = await _register(client, sfx, "owner")
    client.cookies.set("atelier_token", token)
    cr = await client.post("/studios", json={"name": f"S{sfx}", "description": "d"})
    assert cr.status_code == 200
    studio_id = cr.json()["id"]
    sw = await client.post(
        f"/studios/{studio_id}/software",
        json={"name": "SW", "description": None},
    )
    assert sw.status_code == 200
    software_id = sw.json()["id"]
    return token, studio_id, software_id


@pytest.mark.asyncio
async def test_projects_crud_and_rbac(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    token_admin, studio_id, software_id = await _studio_with_software(client, sfx)

    token_member = await _register(client, sfx, "member")
    client.cookies.set("atelier_token", token_admin)
    await client.post(
        f"/studios/{studio_id}/members",
        json={"email": f"member-{sfx}@example.com", "role": "studio_member"},
    )

    client.cookies.set("atelier_token", token_member)
    empty = await client.get(f"/software/{software_id}/projects")
    assert empty.status_code == 200
    assert empty.json() == []

    create = await client.post(
        f"/software/{software_id}/projects",
        json={"name": "Proj A", "description": "desc"},
    )
    assert create.status_code == 200
    pid = create.json()["id"]
    assert create.json()["publish_folder_slug"] == "proj-a"

    client.cookies.set("atelier_token", token_admin)
    put = await client.put(
        f"/software/{software_id}/projects/{pid}",
        json={"name": "Proj A2"},
    )
    assert put.status_code == 200
    assert put.json()["name"] == "Proj A2"

    client.cookies.set("atelier_token", token_member)
    forbidden_put = await client.put(
        f"/software/{software_id}/projects/{pid}",
        json={"name": "nope"},
    )
    assert forbidden_put.status_code == 403

    detail = await client.get(f"/software/{software_id}/projects/{pid}")
    assert detail.status_code == 200
    body = detail.json()
    assert body["name"] == "Proj A2"
    assert body["sections"] == []

    client.cookies.set("atelier_token", token_admin)
    dr = await client.delete(f"/software/{software_id}/projects/{pid}")
    assert dr.status_code == 204

    token_out = await _register(client, sfx, "outsider")
    client.cookies.set("atelier_token", token_out)
    post_out = await client.post(
        f"/software/{software_id}/projects",
        json={"name": "Intruder", "description": None},
    )
    assert post_out.status_code == 403
    gf = await client.get(f"/software/{software_id}/projects")
    assert gf.status_code == 403


@pytest.mark.asyncio
async def test_list_projects_includes_dashboard_aggregates(
    client: AsyncClient,
) -> None:
    """List response includes work order and section rollups for the software dashboard."""
    sfx = uuid.uuid4().hex[:8]
    token, _studio_id, software_id = await _studio_with_software(client, sfx)
    client.cookies.set("atelier_token", token)

    pr = await client.post(
        f"/software/{software_id}/projects",
        json={"name": "DashProj", "description": "A project for dashboard counts"},
    )
    assert pr.status_code == 200, pr.text
    pid = pr.json()["id"]
    assert pr.json()["work_orders_total"] == 0
    assert pr.json()["sections_count"] == 0

    sec = await client.post(
        f"/projects/{pid}/sections",
        json={"title": "S1", "slug": f"s1-{sfx}"},
    )
    assert sec.status_code == 200, sec.text
    sec2 = await client.post(
        f"/projects/{pid}/sections",
        json={"title": "S2", "slug": f"s2-{sfx}"},
    )
    assert sec2.status_code == 200, sec2.text
    sid = sec.json()["id"]

    wo1 = await client.post(
        f"/projects/{pid}/work-orders",
        json={
            "title": "WO backlog",
            "description": "d",
            "status": "backlog",
            "section_ids": [sid],
        },
    )
    assert wo1.status_code == 200, wo1.text
    wo2 = await client.post(
        f"/projects/{pid}/work-orders",
        json={
            "title": "WO done",
            "description": "d",
            "status": "done",
            "section_ids": [sid],
        },
    )
    assert wo2.status_code == 200, wo2.text

    listed = await client.get(f"/software/{software_id}/projects")
    assert listed.status_code == 200, listed.text
    rows = listed.json()
    assert len(rows) == 1
    row = rows[0]
    assert row["id"] == pid
    assert row["sections_count"] == 2
    assert row["work_orders_total"] == 2
    assert row["work_orders_done"] == 1
    assert row["last_edited_at"] is not None


@pytest.mark.asyncio
async def test_publish_folder_slug_conflict_on_update(
    client: AsyncClient,
) -> None:
    """Cannot take another project's publish_folder_slug."""
    sfx = uuid.uuid4().hex[:8]
    token, _studio_id, software_id = await _studio_with_software(client, sfx)
    client.cookies.set("atelier_token", token)

    p1 = await client.post(
        f"/software/{software_id}/projects",
        json={"name": "Alpha", "description": None},
    )
    assert p1.status_code == 200
    slug_a = p1.json()["publish_folder_slug"]

    p2 = await client.post(
        f"/software/{software_id}/projects",
        json={"name": "Beta", "description": None},
    )
    assert p2.status_code == 200
    pid2 = p2.json()["id"]

    conflict = await client.put(
        f"/software/{software_id}/projects/{pid2}",
        json={"publish_folder_slug": slug_a},
    )
    assert conflict.status_code == 409
    assert conflict.json()["code"] == "PUBLISH_FOLDER_SLUG_TAKEN"


@pytest.mark.asyncio
async def test_publish_folder_slug_rename_calls_git_when_configured(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, studio_id, software_id = await _studio_with_software(client, sfx)
    client.cookies.set("atelier_token", token)

    patch_git = await client.put(
        f"/studios/{studio_id}/software/{software_id}",
        json={
            "git_repo_url": "https://gitlab.example.com/group/repo",
            "git_branch": "main",
            "git_token": "glpat-test-token-123",
        },
    )
    assert patch_git.status_code == 200, patch_git.text

    pr = await client.post(
        f"/software/{software_id}/projects",
        json={"name": "FolderProj", "description": None},
    )
    assert pr.status_code == 200
    pid = pr.json()["id"]
    assert pr.json()["publish_folder_slug"] == "folder-proj"

    calls: list[tuple[str, str]] = []

    async def fake_list(**kwargs: object) -> list[str]:
        assert kwargs["path_prefix"] == "folder-proj"
        return ["folder-proj/README.md"]

    async def fake_moves(**kwargs: object) -> tuple[str, str | None]:
        moves = kwargs["moves"]
        assert isinstance(moves, list) and len(moves) == 1
        calls.append((moves[0][0], moves[0][1]))
        return ("https://gitlab.example.com/commit/abc", "abc123")

    monkeypatch.setattr(
        "app.services.project_service.list_repo_blob_paths_under_prefix",
        fake_list,
    )
    monkeypatch.setattr(
        "app.services.project_service.commit_moves",
        fake_moves,
    )

    upd = await client.put(
        f"/software/{software_id}/projects/{pid}",
        json={"publish_folder_slug": "renamed-proj"},
    )
    assert upd.status_code == 200, upd.text
    assert upd.json()["publish_folder_slug"] == "renamed-proj"
    assert calls == [("folder-proj/README.md", "renamed-proj/README.md")]
