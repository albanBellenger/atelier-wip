"""Software-wide documentation sections API."""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.integration.studio_http_seed import post_admin_studio


async def _register_return_token(client: AsyncClient, suffix: str, label: str) -> str:
    client.cookies.clear()
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
    return str(token)


@pytest.mark.asyncio
async def test_software_docs_sections_rbac_and_crud(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token_owner = await _register_return_token(client, sfx, "owner")
    cr = await post_admin_studio(
        client,
        db_session,
        user_email=f"owner-{sfx}@example.com",
        json_body={"name": f"S{sfx}", "description": "d"},
    )
    assert cr.status_code == 200
    studio_id = cr.json()["id"]

    client.cookies.clear()
    client.cookies.set("atelier_token", token_owner)
    sw = await client.post(
        f"/studios/{studio_id}/software",
        json={"name": "SW"},
    )
    assert sw.status_code == 200
    software_id = sw.json()["id"]

    client.cookies.clear()
    na = await client.get(f"/software/{software_id}/docs")
    assert na.status_code == 401

    client.cookies.set("atelier_token", token_owner)
    empty = await client.get(f"/software/{software_id}/docs")
    assert empty.status_code == 200
    assert empty.json() == []

    token_member = await _register_return_token(client, sfx, "member")

    client.cookies.clear()
    client.cookies.set("atelier_token", token_owner)
    await client.post(
        f"/studios/{studio_id}/members",
        json={"email": f"member-{sfx}@example.com", "role": "studio_member"},
    )

    client.cookies.clear()
    client.cookies.set("atelier_token", token_member)
    forbidden_create = await client.post(
        f"/software/{software_id}/docs",
        json={"title": "Shared README"},
    )
    assert forbidden_create.status_code == 403

    client.cookies.clear()
    client.cookies.set("atelier_token", token_owner)
    ok = await client.post(
        f"/software/{software_id}/docs",
        json={"title": "Shared README"},
    )
    assert ok.status_code == 200, ok.text
    body = ok.json()
    sec_id = body["id"]
    assert body["slug"] == "shared-readme"
    assert body["software_id"] == software_id
    assert body["project_id"] is None

    with_body = await client.post(
        f"/software/{software_id}/docs",
        json={
            "title": "Architecture notes",
            "slug": "architecture",
            "content": "## Overview\n\nInitial draft from API.",
        },
    )
    assert with_body.status_code == 200, with_body.text
    assert "## Overview" in (with_body.json().get("content") or "")

    client.cookies.clear()
    client.cookies.set("atelier_token", token_member)
    lst = await client.get(f"/software/{software_id}/docs")
    assert lst.status_code == 200
    assert len(lst.json()) == 2
    slugs = {row["slug"] for row in lst.json()}
    assert "shared-readme" in slugs and "architecture" in slugs

    one = await client.get(f"/software/{software_id}/docs/{sec_id}")
    assert one.status_code == 200

    patch_content = await client.patch(
        f"/software/{software_id}/docs/{sec_id}",
        json={"content": "## Hello"},
    )
    assert patch_content.status_code == 200, patch_content.text
    assert "## Hello" in (patch_content.json().get("content") or "")

    wrong = await client.get(f"/software/{uuid.uuid4()}/docs/{sec_id}")
    assert wrong.status_code == 404
