"""GET /studios/{studio_id}/me/capabilities — RBAC flags from server."""

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
async def test_capabilities_missing_auth_401(client: AsyncClient) -> None:
    gid = uuid.uuid4()
    r = await client.get(f"/studios/{gid}/me/capabilities")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_capabilities_studio_admin_member_viewer(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    token_owner = await _register(client, sfx, "owner")
    client.cookies.set("atelier_token", token_owner)
    studio_id = (
        await client.post("/studios", json={"name": f"S{sfx}", "description": ""})
    ).json()["id"]

    cap = await client.get(f"/studios/{studio_id}/me/capabilities")
    assert cap.status_code == 200
    body = cap.json()
    assert body["is_studio_admin"] is True
    assert body["is_studio_editor"] is True
    assert body["can_publish"] is True
    assert body["can_edit_software_definition"] is True
    assert body["can_create_project"] is True
    assert body["can_manage_project_outline"] is True
    assert body["membership_role"] == "studio_admin"
    assert body["cross_studio_grant"] is None

    sw_id = (
        await client.post(
            f"/studios/{studio_id}/software",
            json={"name": f"SW{sfx}", "description": ""},
        )
    ).json()["id"]

    cap_sw = await client.get(
        f"/studios/{studio_id}/me/capabilities",
        params={"software_id": sw_id},
    )
    assert cap_sw.status_code == 200
    sw_body = cap_sw.json()
    assert sw_body["is_studio_admin"] is True
    assert sw_body["cross_studio_grant"] is None

    token_builder = await _register(client, sfx, "builder")
    client.cookies.set("atelier_token", token_owner)
    inv = await client.post(
        f"/studios/{studio_id}/members",
        json={"email": f"builder-{sfx}@example.com", "role": "studio_member"},
    )
    assert inv.status_code == 200

    client.cookies.set("atelier_token", token_builder)
    cap_b = await client.get(f"/studios/{studio_id}/me/capabilities")
    assert cap_b.status_code == 200
    bb = cap_b.json()
    assert bb["is_studio_admin"] is False
    assert bb["is_studio_editor"] is True
    assert bb["can_publish"] is True
    assert bb["can_edit_software_definition"] is False
    assert bb["can_create_project"] is True
    assert bb["can_manage_project_outline"] is False
    assert bb["membership_role"] == "studio_member"

    token_viewer = await _register(client, sfx, "viewer")
    client.cookies.set("atelier_token", token_owner)
    inv_v = await client.post(
        f"/studios/{studio_id}/members",
        json={"email": f"viewer-{sfx}@example.com", "role": "studio_viewer"},
    )
    assert inv_v.status_code == 200

    client.cookies.set("atelier_token", token_viewer)
    cap_v = await client.get(f"/studios/{studio_id}/me/capabilities")
    assert cap_v.status_code == 200
    vb = cap_v.json()
    assert vb["is_studio_admin"] is False
    assert vb["is_studio_editor"] is False
    assert vb["can_publish"] is False
    assert vb["can_edit_software_definition"] is False
    assert vb["can_create_project"] is False
    assert vb["membership_role"] == "studio_viewer"


@pytest.mark.asyncio
async def test_capabilities_cross_studio_editor(client: AsyncClient) -> None:
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

    client.cookies.set("atelier_token", token_b)
    req = await client.post(
        f"/studios/{studio_b}/cross-studio-request",
        json={"target_software_id": sw_id, "requested_access_level": "viewer"},
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
    cap = await client.get(
        f"/studios/{studio_a}/me/capabilities",
        params={"software_id": sw_id},
    )
    assert cap.status_code == 200
    x = cap.json()
    assert x["cross_studio_grant"] is not None
    assert x["cross_studio_grant"]["access_level"] == "external_editor"
    assert x["is_cross_studio_viewer"] is False
    assert x["is_studio_editor"] is True
    assert x["can_publish"] is False
    assert x["can_create_project"] is False
    assert x["can_manage_project_outline"] is False
    assert x["can_edit_software_definition"] is False


@pytest.mark.asyncio
async def test_capabilities_cross_studio_viewer(client: AsyncClient) -> None:
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

    client.cookies.set("atelier_token", token_b)
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
    cap_v = await client.get(
        f"/studios/{studio_a}/me/capabilities",
        params={"software_id": sw_id},
    )
    assert cap_v.status_code == 200
    xv = cap_v.json()
    assert xv["is_cross_studio_viewer"] is True
    assert xv["is_studio_editor"] is False


@pytest.mark.asyncio
async def test_capabilities_wrong_studio_403(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    await _register(client, sfx, "_consume_tool_admin_slot")
    token_member = await _register(client, sfx, "member_only")
    client.cookies.set("atelier_token", token_member)
    mine = (await client.post("/studios", json={"name": f"M{sfx}", "description": ""})).json()[
        "id"
    ]

    token_other_owner = await _register(client, sfx, "other_owner")
    client.cookies.set("atelier_token", token_other_owner)
    other = (await client.post("/studios", json={"name": f"O{sfx}", "description": ""})).json()[
        "id"
    ]

    client.cookies.set("atelier_token", token_member)
    denied = await client.get(f"/studios/{other}/me/capabilities")
    assert denied.status_code == 403

    ok = await client.get(f"/studios/{mine}/me/capabilities")
    assert ok.status_code == 200


@pytest.mark.asyncio
async def test_capabilities_software_not_under_studio_404(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    token_a = await _register(client, sfx, "own")
    client.cookies.set("atelier_token", token_a)
    studio_a = (
        await client.post("/studios", json={"name": f"A{sfx}", "description": ""})
    ).json()["id"]
    sw_id = (
        await client.post(
            f"/studios/{studio_a}/software",
            json={"name": f"SW{sfx}", "description": ""},
        )
    ).json()["id"]

    await _register(client, sfx, "s2")
    client.cookies.set("atelier_token", token_a)
    studio_b = (
        await client.post("/studios", json={"name": f"B{sfx}", "description": ""})
    ).json()["id"]

    bad = await client.get(
        f"/studios/{studio_b}/me/capabilities",
        params={"software_id": sw_id},
    )
    assert bad.status_code == 404


@pytest.mark.asyncio
async def test_capabilities_unknown_software_404(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    token = await _register(client, sfx, "m")
    client.cookies.set("atelier_token", token)
    studio_id = (
        await client.post("/studios", json={"name": f"S{sfx}", "description": ""})
    ).json()["id"]
    missing_sw = uuid.uuid4()
    nf = await client.get(
        f"/studios/{studio_id}/me/capabilities",
        params={"software_id": str(missing_sw)},
    )
    assert nf.status_code == 404
