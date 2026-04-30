"""Cross-studio access: request, approve, viewer vs editor, revoke."""

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


@pytest_asyncio.fixture(autouse=True)
async def _truncate_users(db_session: AsyncSession) -> None:
    await db_session.execute(text("TRUNCATE TABLE users RESTART IDENTITY CASCADE"))
    await db_session.flush()


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
async def test_cross_studio_viewer_revoke_and_me_grants(
    client: AsyncClient,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token_ta = await _register(client, sfx, "ta")
    client.cookies.set("atelier_token", token_ta)
    studio_a = (
        await client.post("/studios", json={"name": f"A{sfx}", "description": ""})
    ).json()["id"]
    sw_id = (
        await client.post(
            f"/studios/{studio_a}/software",
            json={"name": f"SW{sfx}", "description": ""},
        )
    ).json()["id"]
    proj_id = (
        await client.post(
            f"/software/{sw_id}/projects",
            json={"name": f"P{sfx}", "description": ""},
        )
    ).json()["id"]
    sec_id = (
        await client.post(
            f"/projects/{proj_id}/sections",
            json={"title": "Intro"},
        )
    ).json()["id"]

    token_b = await _register(client, sfx, "adminb")
    client.cookies.set("atelier_token", token_b)
    studio_b = (
        await client.post("/studios", json={"name": f"B{sfx}", "description": ""})
    ).json()["id"]

    token_m = await _register(client, sfx, "memberb")
    client.cookies.set("atelier_token", token_b)
    inv = await client.post(
        f"/studios/{studio_b}/members",
        json={"email": f"memberb-{sfx}@example.com", "role": "studio_member"},
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
        f"/admin/cross-studio/{grant_id}",
        json={"decision": "approve", "access_level": "viewer"},
    )
    assert apr.status_code == 200

    client.cookies.set("atelier_token", token_m)
    me_r = await client.get("/auth/me")
    assert me_r.status_code == 200
    grants = me_r.json().get("cross_studio_grants") or []
    assert len(grants) >= 1
    assert grants[0]["target_software_id"] == sw_id

    gr = await client.get(f"/studios/{studio_a}/software/{sw_id}")
    assert gr.status_code == 200

    bad_proj = await client.post(
        f"/software/{sw_id}/projects",
        json={"name": "Blocked"},
    )
    assert bad_proj.status_code == 403

    gp = await client.get(f"/software/{sw_id}/projects/{proj_id}")
    assert gp.status_code == 200

    patch = await client.patch(
        f"/projects/{proj_id}/sections/{sec_id}",
        json={"content": "no-edit"},
    )
    assert patch.status_code == 403

    issues = await client.get(f"/projects/{proj_id}/issues")
    assert issues.status_code == 403

    pub = await client.post(f"/projects/{proj_id}/publish", json={})
    assert pub.status_code == 403

    client.cookies.set("atelier_token", token_ta)
    rev = await client.put(
        f"/admin/cross-studio/{grant_id}",
        json={"decision": "revoke"},
    )
    assert rev.status_code == 200

    client.cookies.set("atelier_token", token_m)
    denied = await client.get(f"/studios/{studio_a}/software/{sw_id}")
    assert denied.status_code == 403


@pytest.mark.asyncio
async def test_cross_studio_external_editor_patch_not_publish(
    client: AsyncClient,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token_ta = await _register(client, sfx, "ta2")
    client.cookies.set("atelier_token", token_ta)
    studio_a = (
        await client.post("/studios", json={"name": f"A2{sfx}", "description": ""})
    ).json()["id"]
    sw_id = (
        await client.post(
            f"/studios/{studio_a}/software",
            json={"name": f"SW2{sfx}", "description": ""},
        )
    ).json()["id"]
    proj_id = (
        await client.post(
            f"/software/{sw_id}/projects",
            json={"name": f"P2{sfx}", "description": ""},
        )
    ).json()["id"]
    sec_id = (
        await client.post(
            f"/projects/{proj_id}/sections",
            json={"title": "Body"},
        )
    ).json()["id"]

    token_b = await _register(client, sfx, "adminb2")
    client.cookies.set("atelier_token", token_b)
    studio_b = (
        await client.post("/studios", json={"name": f"B2{sfx}", "description": ""})
    ).json()["id"]

    token_m = await _register(client, sfx, "memberb2")
    client.cookies.set("atelier_token", token_b)
    inv = await client.post(
        f"/studios/{studio_b}/members",
        json={"email": f"memberb2-{sfx}@example.com", "role": "studio_member"},
    )
    assert inv.status_code == 200

    req = await client.post(
        f"/studios/{studio_b}/cross-studio-request",
        json={
            "target_software_id": sw_id,
            "requested_access_level": "external_editor",
        },
    )
    assert req.status_code == 200
    grant_id = req.json()["id"]

    client.cookies.set("atelier_token", token_ta)
    apr = await client.put(
        f"/admin/cross-studio/{grant_id}",
        json={"decision": "approve", "access_level": "external_editor"},
    )
    assert apr.status_code == 200

    client.cookies.set("atelier_token", token_m)
    patch = await client.patch(
        f"/projects/{proj_id}/sections/{sec_id}",
        json={"content": "edited-by-external"},
    )
    assert patch.status_code == 200

    pub = await client.post(f"/projects/{proj_id}/publish", json={})
    assert pub.status_code == 403
