"""Slice 2: studios, members, software, git test (mocked)."""

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


@pytest.mark.asyncio
async def test_studio_software_rbac_and_git_test_mocked(
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

    patch_git = await client.patch(
        f"/studios/{studio_id}/software/{sw_id}",
        json={
            "definition": "Be helpful.",
            "git_repo_url": "https://gitlab.example.com/g/p",
            "git_branch": "main",
            "git_token": "glpat-test-token",
        },
    )
    assert patch_git.status_code == 200
    assert patch_git.json()["git_token_set"] is True

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
