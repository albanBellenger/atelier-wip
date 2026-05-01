"""Integration tests for GET/PATCH /me/notifications and mark-all-read."""

import uuid
from datetime import datetime, timezone

import pytest
from httpx import AsyncClient

from app.models import Notification


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
async def test_list_notifications_unauthorized(client: AsyncClient) -> None:
    r = await client.get("/me/notifications")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_list_notifications_empty(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    token = await _register(client, sfx, "notifuser")
    client.cookies.set("atelier_token", token)
    r = await client.get("/me/notifications")
    assert r.status_code == 200
    body = r.json()
    assert body["items"] == []
    assert body["next_cursor"] is None


@pytest.mark.asyncio
async def test_list_notifications_invalid_limit_422(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    token = await _register(client, sfx, "limuser")
    client.cookies.set("atelier_token", token)
    r = await client.get("/me/notifications?limit=0")
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_list_notifications_invalid_cursor_422(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    token = await _register(client, sfx, "curuser")
    client.cookies.set("atelier_token", token)
    r = await client.get("/me/notifications?cursor=not-valid-cursor")
    assert r.status_code == 422
    assert r.json().get("code") == "VALIDATION_ERROR"


@pytest.mark.asyncio
async def test_list_notifications_pagination(
    client: AsyncClient, db_session
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token = await _register(client, sfx, "pageuser")
    client.cookies.set("atelier_token", token)
    me = await client.get("/auth/me")
    assert me.status_code == 200
    uid = uuid.UUID(me.json()["user"]["id"])

    for i in range(3):
        db_session.add(
            Notification(
                id=uuid.uuid4(),
                user_id=uid,
                kind="system",
                title=f"T{i}",
                body="body",
                read_at=None,
                created_at=datetime(2026, 5, 1, 10, i, 0, tzinfo=timezone.utc),
            )
        )
    await db_session.flush()

    r = await client.get("/me/notifications?limit=2")
    assert r.status_code == 200
    data = r.json()
    assert len(data["items"]) == 2
    assert data["next_cursor"] is not None

    r2 = await client.get(f"/me/notifications?limit=2&cursor={data['next_cursor']}")
    assert r2.status_code == 200
    assert len(r2.json()["items"]) >= 1


@pytest.mark.asyncio
async def test_patch_notification_mark_read(
    client: AsyncClient, db_session
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token = await _register(client, sfx, "patchuser")
    client.cookies.set("atelier_token", token)
    me = await client.get("/auth/me")
    uid = uuid.UUID(me.json()["user"]["id"])
    nid = uuid.uuid4()
    db_session.add(
        Notification(
            id=nid,
            user_id=uid,
            kind="gap",
            title="Gap",
            body="detail",
            read_at=None,
            created_at=datetime.now(timezone.utc),
        )
    )
    await db_session.flush()

    r = await client.patch(
        f"/me/notifications/{nid}",
        json={"read": True},
    )
    assert r.status_code == 200
    assert r.json()["read_at"] is not None

    r2 = await client.patch(
        f"/me/notifications/{nid}",
        json={"read": False},
    )
    assert r2.status_code == 200
    assert r2.json()["read_at"] is None


@pytest.mark.asyncio
async def test_patch_notification_not_found_404(
    client: AsyncClient,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token = await _register(client, sfx, "nfuser")
    client.cookies.set("atelier_token", token)
    missing = uuid.uuid4()
    r = await client.patch(
        f"/me/notifications/{missing}",
        json={"read": True},
    )
    assert r.status_code == 404
    assert r.json()["code"] == "NOT_FOUND"


@pytest.mark.asyncio
async def test_patch_notification_wrong_owner_404(
    client: AsyncClient, db_session
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token_a = await _register(client, sfx, "ownera")
    token_b = await _register(client, sfx, "ownerb")
    client.cookies.set("atelier_token", token_a)
    uid_a = uuid.UUID((await client.get("/auth/me")).json()["user"]["id"])
    nid = uuid.uuid4()
    db_session.add(
        Notification(
            id=nid,
            user_id=uid_a,
            kind="system",
            title="x",
            body="y",
            read_at=None,
            created_at=datetime.now(timezone.utc),
        )
    )
    await db_session.flush()

    client.cookies.set("atelier_token", token_b)
    r = await client.patch(
        f"/me/notifications/{nid}",
        json={"read": True},
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_patch_notification_invalid_body_422(
    client: AsyncClient, db_session
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token = await _register(client, sfx, "badbody")
    client.cookies.set("atelier_token", token)
    uid = uuid.UUID((await client.get("/auth/me")).json()["user"]["id"])
    nid = uuid.uuid4()
    db_session.add(
        Notification(
            id=nid,
            user_id=uid,
            kind="system",
            title="x",
            body="y",
            read_at=None,
            created_at=datetime.now(timezone.utc),
        )
    )
    await db_session.flush()

    r = await client.patch(f"/me/notifications/{nid}", json={})
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_mark_all_read(client: AsyncClient, db_session) -> None:
    sfx = uuid.uuid4().hex[:8]
    token = await _register(client, sfx, "allread")
    client.cookies.set("atelier_token", token)
    uid = uuid.UUID((await client.get("/auth/me")).json()["user"]["id"])
    for _ in range(2):
        db_session.add(
            Notification(
                id=uuid.uuid4(),
                user_id=uid,
                kind="system",
                title="t",
                body="b",
                read_at=None,
                created_at=datetime.now(timezone.utc),
            )
        )
    await db_session.flush()

    r = await client.post("/me/notifications/mark-all-read")
    assert r.status_code == 200
    assert r.json()["updated"] == 2

    r2 = await client.get("/me/notifications")
    assert all(x["read_at"] is not None for x in r2.json()["items"])
