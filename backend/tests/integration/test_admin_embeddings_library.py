"""Tool admin GET /admin/embeddings/library (per-studio RAG index stats)."""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import update

from app.models import User


@pytest.mark.asyncio
async def test_admin_embedding_library_overview_ok(
    client: AsyncClient,
    db_session,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    email = f"emlib-adm-{sfx}@example.com"
    r = await client.post(
        "/auth/register",
        json={
            "email": email,
            "password": "securepass123",
            "display_name": "TA",
        },
    )
    assert r.status_code == 200
    await db_session.execute(
        update(User).where(User.email == email.lower()).values(is_platform_admin=True)
    )
    await db_session.flush()

    r_login = await client.post(
        "/auth/login",
        json={"email": email, "password": "securepass123"},
    )
    assert r_login.status_code == 200
    tok = r_login.cookies.get("atelier_token")
    assert tok
    client.cookies.set("atelier_token", tok)

    st = (await client.post("/admin/studios", json={"name": f"Lib Studio {sfx}"})).json()
    studio_id = st["id"]

    lib = await client.get("/admin/embeddings/library")
    assert lib.status_code == 200
    rows = lib.json()
    assert isinstance(rows, list)
    match = next((x for x in rows if x["studio_id"] == studio_id), None)
    assert match is not None
    assert match["studio_name"] == f"Lib Studio {sfx}"
    for key in (
        "artifact_count",
        "embedded_artifact_count",
        "artifact_vector_chunks",
        "section_vector_chunks",
    ):
        assert key in match
        assert isinstance(match[key], int)


@pytest.mark.asyncio
async def test_admin_embedding_library_forbidden_for_member(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    await client.post(
        "/auth/register",
        json={
            "email": f"emlib-mem-{sfx}@example.com",
            "password": "securepass123",
            "display_name": "Mem",
        },
    )
    r_login = await client.post(
        "/auth/login",
        json={"email": f"emlib-mem-{sfx}@example.com", "password": "securepass123"},
    )
    assert r_login.status_code == 200
    client.cookies.set("atelier_token", r_login.cookies.get("atelier_token"))
    denied = await client.get("/admin/embeddings/library")
    assert denied.status_code == 403
