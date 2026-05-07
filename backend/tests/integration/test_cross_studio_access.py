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
        f"/studios/{studio_a}/cross-studio-incoming/{grant_id}",
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
        f"/studios/{studio_a}/cross-studio-incoming/{grant_id}",
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
        f"/studios/{studio_a}/cross-studio-incoming/{grant_id}",
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


@pytest.mark.asyncio
async def test_cross_studio_viewer_studio_software_list_filtered(
    client: AsyncClient,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token_ta = await _register(client, sfx, "tasw")
    client.cookies.set("atelier_token", token_ta)
    studio_a = (
        await client.post("/studios", json={"name": f"LASW{sfx}", "description": ""})
    ).json()["id"]
    sw_granted = (
        await client.post(
            f"/studios/{studio_a}/software",
            json={"name": f"GW{sfx}", "description": ""},
        )
    ).json()["id"]
    sw_other = (
        await client.post(
            f"/studios/{studio_a}/software",
            json={"name": f"OW{sfx}", "description": ""},
        )
    ).json()["id"]

    token_b = await _register(client, sfx, "adminSw")
    client.cookies.set("atelier_token", token_b)
    studio_b = (
        await client.post("/studios", json={"name": f"LBSW{sfx}", "description": ""})
    ).json()["id"]

    token_m = await _register(client, sfx, "viewerSw")
    client.cookies.set("atelier_token", token_b)
    inv = await client.post(
        f"/studios/{studio_b}/members",
        json={"email": f"viewerSw-{sfx}@example.com", "role": "studio_member"},
    )
    assert inv.status_code == 200

    req = await client.post(
        f"/studios/{studio_b}/cross-studio-request",
        json={"target_software_id": sw_granted, "requested_access_level": "viewer"},
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
    lst = await client.get(f"/studios/{studio_a}/software")
    assert lst.status_code == 200
    ids = {item["id"] for item in lst.json()}
    assert sw_granted in ids
    assert sw_other not in ids

    client.cookies.set("atelier_token", token_ta)
    studio_other = (
        await client.post("/studios", json={"name": f"NOGR{sfx}", "description": ""})
    ).json()["id"]
    client.cookies.set("atelier_token", token_m)
    denied = await client.get(f"/studios/{studio_other}/software")
    assert denied.status_code == 403


@pytest.mark.asyncio
async def test_cross_studio_external_editor_outline_forbidden(
    client: AsyncClient,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token_ta = await _register(client, sfx, "taol")
    client.cookies.set("atelier_token", token_ta)
    studio_a = (
        await client.post("/studios", json={"name": f"AOL{sfx}", "description": ""})
    ).json()["id"]
    sw_id = (
        await client.post(
            f"/studios/{studio_a}/software",
            json={"name": f"SWOL{sfx}", "description": ""},
        )
    ).json()["id"]
    proj_id = (
        await client.post(
            f"/software/{sw_id}/projects",
            json={"name": f"POL{sfx}", "description": ""},
        )
    ).json()["id"]
    sec_id = (
        await client.post(
            f"/projects/{proj_id}/sections",
            json={"title": "Keep"},
        )
    ).json()["id"]
    sec_extra = (
        await client.post(
            f"/projects/{proj_id}/sections",
            json={"title": "RemoveMe"},
        )
    ).json()["id"]

    token_b = await _register(client, sfx, "adminbol")
    client.cookies.set("atelier_token", token_b)
    studio_b = (
        await client.post("/studios", json={"name": f"BOL{sfx}", "description": ""})
    ).json()["id"]

    token_m = await _register(client, sfx, "exted")
    client.cookies.set("atelier_token", token_b)
    inv = await client.post(
        f"/studios/{studio_b}/members",
        json={"email": f"exted-{sfx}@example.com", "role": "studio_member"},
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
        f"/studios/{studio_a}/cross-studio-incoming/{grant_id}",
        json={"decision": "approve", "access_level": "external_editor"},
    )
    assert apr.status_code == 200

    client.cookies.set("atelier_token", token_m)
    del_sec = await client.delete(f"/projects/{proj_id}/sections/{sec_extra}")
    assert del_sec.status_code == 403

    sec_list = await client.get(f"/projects/{proj_id}/sections")
    assert sec_list.status_code == 200
    order_ids = [s["id"] for s in sec_list.json()]
    ro = await client.post(
        f"/projects/{proj_id}/sections/reorder",
        json={"section_ids": order_ids},
    )
    assert ro.status_code == 403

    token_v = await _register(client, sfx, "viewol")
    client.cookies.set("atelier_token", token_b)
    inv_v = await client.post(
        f"/studios/{studio_b}/members",
        json={"email": f"viewol-{sfx}@example.com", "role": "studio_member"},
    )
    assert inv_v.status_code == 200
    req_v = await client.post(
        f"/studios/{studio_b}/cross-studio-request",
        json={"target_software_id": sw_id, "requested_access_level": "viewer"},
    )
    assert req_v.status_code == 200
    gid_v = req_v.json()["id"]
    client.cookies.set("atelier_token", token_ta)
    await client.put(
        f"/studios/{studio_a}/cross-studio-incoming/{gid_v}",
        json={"decision": "approve", "access_level": "viewer"},
    )

    client.cookies.set("atelier_token", token_v)
    vdel = await client.delete(f"/projects/{proj_id}/sections/{sec_id}")
    assert vdel.status_code == 403


@pytest.mark.asyncio
async def test_me_token_usage_requires_home_studio_membership(
    client: AsyncClient,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    await _register(client, sfx, "firstuser")
    lonely = await _register(client, sfx, "lonely")
    client.cookies.set("atelier_token", lonely)
    denied = await client.get("/me/token-usage")
    assert denied.status_code == 403

    token_ta = await _register(client, sfx, "tametu")
    client.cookies.set("atelier_token", token_ta)
    studio_a = (
        await client.post("/studios", json={"name": f"AMET{sfx}", "description": ""})
    ).json()["id"]
    sw_id = (
        await client.post(
            f"/studios/{studio_a}/software",
            json={"name": f"SWMET{sfx}", "description": ""},
        )
    ).json()["id"]

    token_b = await _register(client, sfx, "adminmet")
    client.cookies.set("atelier_token", token_b)
    studio_b = (
        await client.post("/studios", json={"name": f"BMET{sfx}", "description": ""})
    ).json()["id"]

    token_m = await _register(client, sfx, "membermet")
    client.cookies.set("atelier_token", token_b)
    inv = await client.post(
        f"/studios/{studio_b}/members",
        json={"email": f"membermet-{sfx}@example.com", "role": "studio_member"},
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
    ok = await client.get("/me/token-usage")
    assert ok.status_code == 200


@pytest.mark.asyncio
async def test_cross_studio_wrong_studio_owner_cannot_resolve(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    token_a = await _register(client, sfx, "owna")
    client.cookies.set("atelier_token", token_a)
    studio_a = (
        await client.post("/studios", json={"name": f"WA{sfx}", "description": ""})
    ).json()["id"]
    sw_id = (
        await client.post(
            f"/studios/{studio_a}/software",
            json={"name": f"SWW{sfx}", "description": ""},
        )
    ).json()["id"]

    token_b = await _register(client, sfx, "ownb")
    client.cookies.set("atelier_token", token_b)
    studio_b = (
        await client.post("/studios", json={"name": f"WB{sfx}", "description": ""})
    ).json()["id"]
    req = await client.post(
        f"/studios/{studio_b}/cross-studio-request",
        json={"target_software_id": sw_id, "requested_access_level": "viewer"},
    )
    assert req.status_code == 200
    grant_id = req.json()["id"]

    token_c = await _register(client, sfx, "ownc")
    client.cookies.set("atelier_token", token_c)
    studio_c = (
        await client.post("/studios", json={"name": f"WC{sfx}", "description": ""})
    ).json()["id"]

    bad = await client.put(
        f"/studios/{studio_c}/cross-studio-incoming/{grant_id}",
        json={"decision": "approve", "access_level": "viewer"},
    )
    assert bad.status_code == 403


@pytest.mark.asyncio
async def test_admin_cross_studio_route_removed(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    from sqlalchemy import update

    from app.models import User

    sfx = uuid.uuid4().hex[:8]
    email = f"cpa-{sfx}@example.com"
    await client.post(
        "/auth/register",
        json={
            "email": email,
            "password": "securepass123",
            "display_name": "PA",
        },
    )
    await db_session.execute(
        update(User).where(User.email == email.lower()).values(is_platform_admin=True)
    )
    await db_session.flush()
    login = await client.post(
        "/auth/login",
        json={"email": email, "password": "securepass123"},
    )
    client.cookies.set("atelier_token", login.cookies.get("atelier_token"))
    r = await client.get("/admin/cross-studio")
    assert r.status_code == 404

