"""Codebase snapshot API — RBAC matrix (Slice 16b)."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.security.field_encryption import encrypt_secret
from tests.factories import (
    add_studio_member,
    create_software,
    create_studio,
    create_user,
)


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


@pytest.fixture
def _patch_codebase_background(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _noop(*args: object, **kwargs: object) -> None:
        return None

    monkeypatch.setattr(
        "app.routers.codebase.enqueue_codebase_index",
        _noop,
    )


@pytest.mark.asyncio
async def test_reindex_commits_snapshot_before_background_enqueue(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Regression: background worker uses async_session_factory; row must be committed first."""
    sfx = uuid.uuid4().hex[:8]
    owner = await create_user(db_session, email=f"rb-{sfx}@example.com")
    studio = await create_studio(db_session, name=f"RB{sfx}")
    await add_studio_member(db_session, studio.id, owner.id, role="studio_admin")
    sw = await create_software(db_session, studio.id, name="SW-RB")
    sw.git_repo_url = "https://gitlab.com/group/repo"
    sw.git_branch = "main"
    sw.git_token = encrypt_secret("gitlab-token")
    await db_session.flush()

    events: list[str] = []
    orig_commit = db_session.commit

    async def wrapped_commit() -> None:
        events.append("session_commit")
        await orig_commit()

    monkeypatch.setattr(db_session, "commit", wrapped_commit)

    async def spy_enqueue(sid: object) -> None:
        events.append(f"enqueue:{sid}")

    monkeypatch.setattr("app.routers.codebase.enqueue_codebase_index", spy_enqueue)

    client.cookies.clear()
    token = await _register_return_token(client, sfx, "rbowner")
    client.cookies.set("atelier_token", token)

    with patch(
        "app.services.codebase_service.embedding_resolvable",
        new_callable=AsyncMock,
        return_value=True,
    ), patch(
        "app.services.codebase_service.list_commits",
        new_callable=AsyncMock,
        return_value=[{"id": "c0ffee" * 8}],
    ):
        r = await client.post(f"/software/{sw.id}/codebase/reindex")
    assert r.status_code == 200, r.text
    snap_id = r.json()["id"]
    assert len(events) == 2
    assert events[0] == "session_commit"
    assert events[1] == f"enqueue:{snap_id}"


@pytest.mark.asyncio
async def test_codebase_snapshot_rbac_matrix(
    client: AsyncClient,
    db_session: AsyncSession,
    _patch_codebase_background: None,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    owner = await create_user(db_session, email=f"owner-{sfx}@example.com")
    viewer = await create_user(db_session, email=f"viewer-{sfx}@example.com")
    outsider = await create_user(db_session, email=f"out-{sfx}@example.com")
    studio = await create_studio(db_session, name=f"S{sfx}")
    await add_studio_member(db_session, studio.id, owner.id, role="studio_admin")
    await add_studio_member(db_session, studio.id, viewer.id, role="studio_viewer")
    sw = await create_software(db_session, studio.id, name="SW")
    sw.git_repo_url = "https://gitlab.com/group/repo"
    sw.git_branch = "main"
    sw.git_token = encrypt_secret("gitlab-token")
    await db_session.flush()

    client.cookies.clear()
    na = await client.get(f"/software/{sw.id}/codebase/snapshots")
    assert na.status_code == 401

    token_owner = await _register_return_token(client, sfx, "tokowner")
    client.cookies.set("atelier_token", token_owner)

    client.cookies.clear()
    no_cookie = await client.post(f"/software/{sw.id}/codebase/reindex")
    assert no_cookie.status_code == 401

    client.cookies.set("atelier_token", token_owner)
    with patch(
        "app.services.codebase_service.embedding_resolvable",
        new_callable=AsyncMock,
        return_value=True,
    ), patch(
        "app.services.codebase_service.list_commits",
        new_callable=AsyncMock,
        return_value=[{"id": "deadbeef" * 8}],
    ):
        r_ok = await client.post(f"/software/{sw.id}/codebase/reindex")
    assert r_ok.status_code == 200, r_ok.text
    body = r_ok.json()
    assert body["status"] == "pending"
    assert body["software_id"] == str(sw.id)

    token_viewer = await _register_return_token(client, sfx, "tokviewer")
    client.cookies.clear()
    client.cookies.set("atelier_token", token_viewer)
    lst = await client.get(f"/software/{sw.id}/codebase/snapshots")
    assert lst.status_code == 200
    assert isinstance(lst.json(), list)

    with patch(
        "app.services.codebase_service.embedding_resolvable",
        new_callable=AsyncMock,
        return_value=True,
    ), patch(
        "app.services.codebase_service.list_commits",
        new_callable=AsyncMock,
        return_value=[{"id": "aaaabbbb" * 8}],
    ):
        forbidden = await client.post(f"/software/{sw.id}/codebase/reindex")
    assert forbidden.status_code == 403

    token_out = await _register_return_token(client, sfx, "tokout")
    client.cookies.clear()
    client.cookies.set("atelier_token", token_out)
    denied = await client.get(f"/software/{sw.id}/codebase/snapshots")
    assert denied.status_code == 403

    bad_uuid = await client.get("/software/not-a-uuid/codebase/snapshots")
    assert bad_uuid.status_code == 422

    client.cookies.clear()
    client.cookies.set("atelier_token", token_owner)
    missing = await client.get(f"/software/{sw.id}/codebase/snapshots/{uuid.uuid4()}")
    assert missing.status_code == 404
