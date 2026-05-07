"""Slice 2: studios, members, software, git test (mocked)."""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import update

from app.models import User


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


@pytest.mark.asyncio
async def test_studio_software_happy_path_and_rbac(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token_admin = await _register(client, sfx, "owner")
    token_member = await _register(client, sfx, "member")
    token_out = await _register(client, sfx, "outsider")

    client.cookies.set("atelier_token", token_admin)
    cr = await client.post(
        "/studios",
        json={"name": f"Studio {sfx}", "description": "d"},
    )
    assert cr.status_code == 200
    studio_id = cr.json()["id"]

    client.cookies.set("atelier_token", token_out)
    gr = await client.get(f"/studios/{studio_id}")
    assert gr.status_code == 403

    client.cookies.set("atelier_token", token_member)
    pr = await client.patch(
        f"/studios/{studio_id}",
        json={"name": "nope"},
    )
    assert pr.status_code == 403

    client.cookies.set("atelier_token", token_admin)
    add = await client.post(
        f"/studios/{studio_id}/members",
        json={"email": f"member-{sfx}@example.com", "role": "studio_member"},
    )
    assert add.status_code == 200

    client.cookies.set("atelier_token", token_member)
    gr2 = await client.get(f"/studios/{studio_id}")
    assert gr2.status_code == 200

    bad_sw = await client.post(
        f"/studios/{studio_id}/software",
        json={"name": "My SW"},
    )
    assert bad_sw.status_code == 403

    client.cookies.set("atelier_token", token_admin)
    sw = await client.post(
        f"/studios/{studio_id}/software",
        json={"name": "Product", "description": "desc"},
    )
    assert sw.status_code == 200
    sw_id = sw.json()["id"]

    client.cookies.set("atelier_token", token_member)
    lr = await client.get(
        f"/studios/{studio_id}/software",
    )
    assert lr.status_code == 200
    assert len(lr.json()) == 1

    client.cookies.set("atelier_token", token_admin)
    async def fake_gitlab_test(
        repo_url: str, token: str, branch: str
    ) -> tuple[bool, str]:
        return True, "mock-ok"

    monkeypatch.setattr(
        "app.services.software_service.test_gitlab_connection",
        fake_gitlab_test,
    )

    put_git = await client.put(
        f"/studios/{studio_id}/software/{sw_id}",
        json={
            "definition": "Be helpful.",
            "git_repo_url": "https://gitlab.example.com/g/p",
            "git_branch": "main",
            "git_token": "glpat-test-token",
        },
    )
    assert put_git.status_code == 200
    assert put_git.json()["git_token_set"] is True

    test_r = await client.post(
        f"/studios/{studio_id}/software/{sw_id}/git/test",
    )
    assert test_r.status_code == 200
    body = test_r.json()
    assert body["ok"] is True
    assert "mock-ok" in body["message"]

    client.cookies.set("atelier_token", token_member)
    del_sw = await client.delete(
        f"/studios/{studio_id}/software/{sw_id}",
    )
    assert del_sw.status_code == 403


@pytest.mark.asyncio
async def test_get_studio_without_auth_returns_401(client: AsyncClient) -> None:
    r = await client.get("/studios/00000000-0000-0000-0000-000000000000")
    assert r.status_code == 401
    assert r.json()["code"] == "UNAUTHORIZED"


@pytest.mark.asyncio
async def test_get_studio_not_found_returns_404(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    token = await _register(client, sfx, "user")
    client.cookies.set("atelier_token", token)
    r = await client.get(f"/studios/{uuid.uuid4()}")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_create_studio_name_empty_returns_422(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    token = await _register(client, sfx, "user")
    client.cookies.set("atelier_token", token)
    r = await client.post("/studios", json={"name": ""})
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_get_software_not_found_returns_404(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    token_admin = await _register(client, sfx, "admin")
    client.cookies.set("atelier_token", token_admin)
    studio = (await client.post("/studios", json={"name": f"S{sfx}"})).json()
    r = await client.get(f"/studios/{studio['id']}/software/{uuid.uuid4()}")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_create_software_without_auth_returns_401(client: AsyncClient) -> None:
    r = await client.post(
        f"/studios/{uuid.uuid4()}/software",
        json={"name": "Test"},
    )
    assert r.status_code == 401
    assert r.json()["code"] == "UNAUTHORIZED"


@pytest.mark.asyncio
async def test_demote_last_admin_returns_400(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    token_admin = await _register(client, sfx, "admin")
    client.cookies.set("atelier_token", token_admin)
    studio = (await client.post("/studios", json={"name": f"S{sfx}"})).json()
    studio_id = studio["id"]
    me_r = await client.get("/auth/me")
    admin_user_id = me_r.json()["user"]["id"]
    r = await client.patch(
        f"/studios/{studio_id}/members/{admin_user_id}",
        json={"role": "studio_member"},
    )
    assert r.status_code == 400
    assert r.json()["code"] == "LAST_ADMIN"


@pytest.mark.asyncio
async def test_delete_studio_cascades_software(
    client: AsyncClient,
    db_session,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token_admin = await _register(client, sfx, "admin")
    client.cookies.set("atelier_token", token_admin)
    studio = (await client.post("/studios", json={"name": f"S{sfx}"})).json()
    studio_id = studio["id"]
    sw = (
        await client.post(
            f"/studios/{studio_id}/software",
            json={"name": "MySW"},
        )
    ).json()
    sw_id = sw["id"]
    await db_session.execute(
        update(User)
        .where(User.email == f"admin-{sfx}@example.com".lower())
        .values(is_platform_admin=True)
    )
    await db_session.flush()
    del_r = await client.delete(f"/admin/studios/{studio_id}")
    assert del_r.status_code == 204
    r = await client.get(f"/studios/{studio_id}/software/{sw_id}")
    assert r.status_code in (403, 404)


@pytest.mark.asyncio
async def test_studio_member_patch_definition_forbidden(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    token_admin = await _register(client, sfx, "owner")
    token_member = await _register(client, sfx, "member")
    client.cookies.set("atelier_token", token_admin)
    studio = (await client.post("/studios", json={"name": f"S{sfx}"})).json()
    studio_id = studio["id"]
    await client.post(
        f"/studios/{studio_id}/members",
        json={"email": f"member-{sfx}@example.com", "role": "studio_member"},
    )
    sw = (
        await client.post(
            f"/studios/{studio_id}/software",
            json={"name": "P"},
        )
    ).json()
    sw_id = sw["id"]
    client.cookies.set("atelier_token", token_member)
    r = await client.patch(
        f"/studios/{studio_id}/software/{sw_id}",
        json={"definition": "Hacked"},
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_studio_admin_patch_definition_ok(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    token_admin = await _register(client, sfx, "owner")
    client.cookies.set("atelier_token", token_admin)
    studio = (await client.post("/studios", json={"name": f"S{sfx}"})).json()
    studio_id = studio["id"]
    sw = (
        await client.post(
            f"/studios/{studio_id}/software",
            json={"name": "P"},
        )
    ).json()
    sw_id = sw["id"]
    r = await client.patch(
        f"/studios/{studio_id}/software/{sw_id}",
        json={"definition": "Official definition text."},
    )
    assert r.status_code == 200
    assert r.json()["definition"] == "Official definition text."
