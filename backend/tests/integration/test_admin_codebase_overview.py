"""Platform admin GET /admin/codebase/overview and POST reindex."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CodebaseChunk, CodebaseFile, CodebaseSnapshot, CodebaseSymbol, User
from app.security.field_encryption import encrypt_secret
from tests.factories import create_software, create_studio, create_user


@pytest.mark.asyncio
async def test_admin_codebase_overview_ok(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    email = f"cbadm-{sfx}@example.com"
    r = await client.post(
        "/auth/register",
        json={
            "email": email,
            "password": "securepass123",
            "display_name": "CB",
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

    studio = await create_studio(db_session, name=f"CB Studio {sfx}")
    sw = await create_software(db_session, studio.id, name="CB-SW")
    sw.git_repo_url = "https://gitlab.com/g/r"
    sw.git_branch = "main"
    sw.git_token = encrypt_secret("t")
    await db_session.flush()

    ready = CodebaseSnapshot(
        software_id=sw.id,
        commit_sha="ab" * 32,
        branch="main",
        status="ready",
        ready_at=datetime.now(timezone.utc),
    )
    db_session.add(ready)
    await db_session.flush()
    cf = CodebaseFile(
        snapshot_id=ready.id,
        path="a.py",
        blob_sha="b1",
        size_bytes=10,
        language="python",
    )
    db_session.add(cf)
    await db_session.flush()
    db_session.add(
        CodebaseChunk(
            snapshot_id=ready.id,
            file_id=cf.id,
            chunk_index=0,
            content="x",
            embedding=[0.01] * 1536,
            start_line=1,
            end_line=1,
        )
    )
    db_session.add(
        CodebaseSymbol(
            snapshot_id=ready.id,
            file_id=cf.id,
            name="foo",
            kind="function",
            start_line=1,
            end_line=2,
        )
    )
    await db_session.flush()

    ov = await client.get("/admin/codebase/overview")
    assert ov.status_code == 200
    rows = ov.json()
    assert isinstance(rows, list)
    match = next((x for x in rows if x["studio_id"] == str(studio.id)), None)
    assert match is not None
    assert match["studio_name"] == f"CB Studio {sfx}"
    assert len(match["software"]) >= 1
    srow = next((s for s in match["software"] if s["software_id"] == str(sw.id)), None)
    assert srow is not None
    assert srow["software_name"] == "CB-SW"
    assert srow["git_configured"] is True
    assert srow["ready_file_count"] == 1
    assert srow["ready_chunk_count"] == 1
    assert srow["ready_symbol_count"] == 1
    assert srow["commit_sha"] == "ab" * 32
    assert srow["branch"] == "main"
    assert srow["newest_snapshot_status"] == "ready"


@pytest.mark.asyncio
async def test_admin_codebase_overview_forbidden_for_member(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    await client.post(
        "/auth/register",
        json={
            "email": f"cbmem-{sfx}@example.com",
            "password": "securepass123",
            "display_name": "Mem",
        },
    )
    r_login = await client.post(
        "/auth/login",
        json={"email": f"cbmem-{sfx}@example.com", "password": "securepass123"},
    )
    assert r_login.status_code == 200
    client.cookies.set("atelier_token", r_login.cookies.get("atelier_token"))
    denied = await client.get("/admin/codebase/overview")
    assert denied.status_code == 403


@pytest.mark.asyncio
async def test_admin_codebase_overview_unauthorized(client: AsyncClient) -> None:
    client.cookies.clear()
    r = await client.get("/admin/codebase/overview")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_admin_codebase_reindex_not_found(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    email = f"cb404-{sfx}@example.com"
    await client.post(
        "/auth/register",
        json={
            "email": email,
            "password": "securepass123",
            "display_name": "A",
        },
    )
    await db_session.execute(
        update(User).where(User.email == email.lower()).values(is_platform_admin=True)
    )
    await db_session.flush()
    r_login = await client.post(
        "/auth/login",
        json={"email": email, "password": "securepass123"},
    )
    assert r_login.status_code == 200
    client.cookies.set("atelier_token", r_login.cookies.get("atelier_token"))

    missing = uuid.uuid4()
    r = await client.post(f"/admin/codebase/software/{missing}/reindex")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_admin_codebase_reindex_ok(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    email = f"cbre-{sfx}@example.com"
    await client.post(
        "/auth/register",
        json={
            "email": email,
            "password": "securepass123",
            "display_name": "R",
        },
    )
    await db_session.execute(
        update(User).where(User.email == email.lower()).values(is_platform_admin=True)
    )
    await db_session.flush()
    r_login = await client.post(
        "/auth/login",
        json={"email": email, "password": "securepass123"},
    )
    assert r_login.status_code == 200
    client.cookies.set("atelier_token", r_login.cookies.get("atelier_token"))

    studio = await create_studio(db_session, name=f"R{sfx}")
    sw = await create_software(db_session, studio.id, name="SW-R")
    sw.git_repo_url = "https://gitlab.com/group/repo"
    sw.git_branch = "main"
    sw.git_token = encrypt_secret("gitlab-token")
    await db_session.flush()

    events: list[str] = []

    async def spy_enqueue(sid: object) -> None:
        events.append(f"enqueue:{sid}")

    monkeypatch.setattr("app.routers.admin.enqueue_codebase_index", spy_enqueue)

    with patch(
        "app.services.codebase_service.embedding_resolvable",
        new_callable=AsyncMock,
        return_value=True,
    ), patch(
        "app.services.codebase_service.list_commits",
        new_callable=AsyncMock,
        return_value=[{"id": "c0ffee" * 8}],
    ):
        r = await client.post(f"/admin/codebase/software/{sw.id}/reindex")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["software_id"] == str(sw.id)
    assert body["status"] == "pending"
    assert len(events) == 1
    assert events[0].startswith("enqueue:")
