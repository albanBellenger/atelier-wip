"""GET /studios list rows with counts; POST /studios platform-admin only."""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

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


@pytest.mark.asyncio
async def test_list_studios_unauthenticated_401(client: AsyncClient) -> None:
    r = await client.get("/studios")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_post_studios_forbidden_for_non_platform_admin(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    sfx = uuid.uuid4().hex[:8]
    tok = await _register(client, sfx, "builder")
    client.cookies.set("atelier_token", tok)
    r = await client.post(
        "/studios",
        json={"name": f"NoCreate{sfx}", "description": ""},
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_list_studios_includes_counts(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    sfx = uuid.uuid4().hex[:8]
    owner_tok = await _register(client, sfx, "owner")
    client.cookies.set("atelier_token", owner_tok)
    studio = (
        await post_admin_studio(
            client,
            db_session,
            user_email=f"owner-{sfx}@example.com",
            json_body={"name": f"CountStudio{sfx}", "description": "d"},
        )
    ).json()
    studio_id = studio["id"]

    sw = await client.post(
        f"/studios/{studio_id}/software",
        json={"name": "SwOne", "description": None, "definition": "Def"},
    )
    assert sw.status_code == 200
    sw_id = sw.json()["id"]
    pr = await client.post(
        f"/software/{sw_id}/projects",
        json={"name": "ProjOne", "description": None},
    )
    assert pr.status_code == 200

    await _register(client, sfx, "extra")
    client.cookies.set("atelier_token", owner_tok)
    add = await client.post(
        f"/studios/{studio_id}/members",
        json={"email": f"extra-{sfx}@example.com", "role": "studio_member"},
    )
    assert add.status_code == 200

    lst = await client.get("/studios")
    assert lst.status_code == 200
    rows = lst.json()
    mine = next(r for r in rows if r["id"] == studio_id)
    assert mine["software_count"] == 1
    assert mine["project_count"] == 1
    assert mine["member_count"] == 2
