"""Tool-admin studio list, detail, and create under /admin/studios."""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import update

from app.models import User


@pytest.mark.asyncio
async def test_admin_studios_list_unauthenticated(client: AsyncClient) -> None:
    r = await client.get("/admin/studios")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_admin_studios_list_forbidden_for_member(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    email = f"asc-mem-{sfx}@example.com"
    await client.post(
        "/auth/register",
        json={
            "email": email,
            "password": "securepass123",
            "display_name": "M",
        },
    )
    r_login = await client.post(
        "/auth/login",
        json={"email": email, "password": "securepass123"},
    )
    assert r_login.status_code == 200
    tok = r_login.cookies.get("atelier_token")
    assert tok
    client.cookies.set("atelier_token", tok)
    denied = await client.get("/admin/studios")
    assert denied.status_code == 403


@pytest.mark.asyncio
async def test_admin_studios_list_and_detail_tool_admin(
    client: AsyncClient,
    db_session,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    admin_email = f"asc-ta-{sfx}@example.com"
    await client.post(
        "/auth/register",
        json={
            "email": admin_email,
            "password": "securepass123",
            "display_name": "TA",
        },
    )
    await db_session.execute(
        update(User)
        .where(User.email == admin_email.lower())
        .values(is_platform_admin=True)
    )
    await db_session.flush()

    r_login = await client.post(
        "/auth/login",
        json={"email": admin_email, "password": "securepass123"},
    )
    assert r_login.status_code == 200
    tok = r_login.cookies.get("atelier_token")
    assert tok
    client.cookies.set("atelier_token", tok)

    cr = await client.post(
        "/studios",
        json={"name": f"ASC Studio {sfx}", "description": "integration"},
    )
    assert cr.status_code == 200
    studio_id = cr.json()["id"]

    listed = await client.get("/admin/studios")
    assert listed.status_code == 200
    rows = listed.json()
    assert isinstance(rows, list)
    match = next((x for x in rows if x["studio_id"] == studio_id), None)
    assert match is not None
    assert match["name"] == f"ASC Studio {sfx}"
    assert match["description"] == "integration"
    assert "created_at" in match
    assert match["software_count"] == 0
    assert match["member_count"] >= 1

    detail = await client.get(f"/admin/studios/{studio_id}")
    assert detail.status_code == 200
    body = detail.json()
    assert body["id"] == studio_id
    assert body["name"] == f"ASC Studio {sfx}"
    assert "gitlab" in body
    assert "git_token_set" in body["gitlab"]


@pytest.mark.asyncio
async def test_admin_studio_detail_not_found(client: AsyncClient, db_session) -> None:
    sfx = uuid.uuid4().hex[:8]
    admin_email = f"asc-nf-{sfx}@example.com"
    await client.post(
        "/auth/register",
        json={
            "email": admin_email,
            "password": "securepass123",
            "display_name": "TA",
        },
    )
    await db_session.execute(
        update(User)
        .where(User.email == admin_email.lower())
        .values(is_platform_admin=True)
    )
    await db_session.flush()
    r_login = await client.post(
        "/auth/login",
        json={"email": admin_email, "password": "securepass123"},
    )
    assert r_login.status_code == 200
    client.cookies.set("atelier_token", r_login.cookies.get("atelier_token"))

    missing = await client.get(f"/admin/studios/{uuid.uuid4()}")
    assert missing.status_code == 404


@pytest.mark.asyncio
async def test_admin_post_studios_creates_studio(
    client: AsyncClient,
    db_session,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    admin_email = f"asc-post-{sfx}@example.com"
    await client.post(
        "/auth/register",
        json={
            "email": admin_email,
            "password": "securepass123",
            "display_name": "TA",
        },
    )
    await db_session.execute(
        update(User)
        .where(User.email == admin_email.lower())
        .values(is_platform_admin=True)
    )
    await db_session.flush()
    r_login = await client.post(
        "/auth/login",
        json={"email": admin_email, "password": "securepass123"},
    )
    assert r_login.status_code == 200
    client.cookies.set("atelier_token", r_login.cookies.get("atelier_token"))

    r = await client.post(
        "/admin/studios",
        json={"name": f"Admin Post {sfx}", "description": "via admin"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == f"Admin Post {sfx}"
    assert data["description"] == "via admin"


@pytest.mark.asyncio
async def test_admin_delete_studio_unauthenticated(client: AsyncClient) -> None:
    r = await client.delete(f"/admin/studios/{uuid.uuid4()}")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_admin_delete_studio_forbidden_for_member(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    email = f"asc-del-mem-{sfx}@example.com"
    await client.post(
        "/auth/register",
        json={
            "email": email,
            "password": "securepass123",
            "display_name": "M",
        },
    )
    r_login = await client.post(
        "/auth/login",
        json={"email": email, "password": "securepass123"},
    )
    assert r_login.status_code == 200
    client.cookies.set("atelier_token", r_login.cookies.get("atelier_token"))
    denied = await client.delete(f"/admin/studios/{uuid.uuid4()}")
    assert denied.status_code == 403


@pytest.mark.asyncio
async def test_admin_delete_studio_not_found(client: AsyncClient, db_session) -> None:
    sfx = uuid.uuid4().hex[:8]
    admin_email = f"asc-del-nf-{sfx}@example.com"
    await client.post(
        "/auth/register",
        json={
            "email": admin_email,
            "password": "securepass123",
            "display_name": "TA",
        },
    )
    await db_session.execute(
        update(User)
        .where(User.email == admin_email.lower())
        .values(is_platform_admin=True)
    )
    await db_session.flush()
    r_login = await client.post(
        "/auth/login",
        json={"email": admin_email, "password": "securepass123"},
    )
    assert r_login.status_code == 200
    client.cookies.set("atelier_token", r_login.cookies.get("atelier_token"))

    missing = await client.delete(f"/admin/studios/{uuid.uuid4()}")
    assert missing.status_code == 404


@pytest.mark.asyncio
async def test_admin_delete_studio_success(
    client: AsyncClient,
    db_session,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    admin_email = f"asc-del-ok-{sfx}@example.com"
    await client.post(
        "/auth/register",
        json={
            "email": admin_email,
            "password": "securepass123",
            "display_name": "TA",
        },
    )
    await db_session.execute(
        update(User)
        .where(User.email == admin_email.lower())
        .values(is_platform_admin=True)
    )
    await db_session.flush()
    r_login = await client.post(
        "/auth/login",
        json={"email": admin_email, "password": "securepass123"},
    )
    assert r_login.status_code == 200
    client.cookies.set("atelier_token", r_login.cookies.get("atelier_token"))

    cr = await client.post(
        "/studios",
        json={"name": f"To Delete {sfx}", "description": None},
    )
    assert cr.status_code == 200
    studio_id = cr.json()["id"]

    dr = await client.delete(f"/admin/studios/{studio_id}")
    assert dr.status_code == 204

    gone = await client.get(f"/admin/studios/{studio_id}")
    assert gone.status_code == 404
