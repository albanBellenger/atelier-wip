"""Software workspace: attention aggregate, activity, token summary."""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from tests.integration.studio_http_seed import post_admin_studio

from app.models import User
from tests.integration.embedding_mocks import patch_fake_embedding_transport


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


async def _studio_software(
    client: AsyncClient, db_session: AsyncSession, sfx: str
) -> tuple[str, str, str]:
    token = await _register(client, sfx, "owner")
    client.cookies.set("atelier_token", token)
    cr = await post_admin_studio(
        client,
        db_session,
        user_email=f"owner-{sfx}@example.com",
        json_body={"name": f"S{sfx}", "description": "d"},
    )
    assert cr.status_code == 200
    studio_id = cr.json()["id"]
    sw = await client.post(
        f"/studios/{studio_id}/software",
        json={"name": "SW", "description": None},
    )
    assert sw.status_code == 200
    software_id = sw.json()["id"]
    return token, studio_id, software_id


async def _promote_tool_admin(db_session: object, email: str) -> None:
    r = await db_session.execute(select(User).where(User.email == email))
    u = r.scalar_one()
    u.is_platform_admin = True
    await db_session.flush()


@pytest.fixture(autouse=True)
def _noop_embed_tasks(monkeypatch: pytest.MonkeyPatch) -> None:
    async def noop(*_a: object, **_k: object) -> None:
        return None

    monkeypatch.setattr(
        "app.services.embedding_pipeline.enqueue_artifact_embedding",
        noop,
    )
    monkeypatch.setattr(
        "app.services.embedding_pipeline.embed_artifact_in_upload_session",
        noop,
    )
    monkeypatch.setattr(
        "app.services.embedding_pipeline.enqueue_section_embedding",
        noop,
    )
    monkeypatch.setattr(
        "app.services.embedding_pipeline.schedule_artifact_embedding",
        lambda *_a, **_k: None,
    )
    monkeypatch.setattr(
        "app.services.embedding_pipeline.schedule_section_embedding",
        lambda *_a, **_k: None,
    )


@pytest.fixture(autouse=True)
def _in_memory_minio(monkeypatch: pytest.MonkeyPatch) -> None:
    store: dict[str, bytes] = {}

    async def ensure_bucket(_self: object) -> None:
        return None

    async def put_bytes(_self: object, object_name: str, data: bytes, _ct: str) -> None:
        store[object_name] = data

    async def get_bytes(_self: object, object_name: str) -> bytes:
        return store[object_name]

    async def remove(_self: object, object_name: str) -> None:
        store.pop(object_name, None)

    from app.storage.minio_storage import StorageClient

    monkeypatch.setattr(StorageClient, "ensure_bucket", ensure_bucket)
    monkeypatch.setattr(StorageClient, "put_bytes", put_bytes)
    monkeypatch.setattr(StorageClient, "get_bytes", get_bytes)
    monkeypatch.setattr(StorageClient, "remove", remove)


@pytest.fixture
def fake_embed(monkeypatch: pytest.MonkeyPatch) -> None:
    patch_fake_embedding_transport(monkeypatch)


@pytest.mark.asyncio
async def test_software_attention_activity_token_summary(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, studio_id, software_id = await _studio_software(client, db_session, sfx)

    att = await client.get(f"/software/{software_id}/attention")
    assert att.status_code == 200
    body = att.json()
    assert body["software_id"] == software_id
    assert body["counts"]["all"] == 0
    assert body["items"] == []

    act = await client.get(f"/software/{software_id}/activity")
    assert act.status_code == 200
    assert act.json()["items"] == []

    pr = await client.post(
        f"/software/{software_id}/projects",
        json={"name": "P1", "description": None},
    )
    assert pr.status_code == 200
    pid = pr.json()["id"]

    act2 = await client.get(f"/software/{software_id}/activity")
    assert act2.status_code == 200
    items = act2.json()["items"]
    assert len(items) >= 1
    assert items[0]["verb"] == "project_created"
    assert items[0]["actor_display"] == "owner"
    assert items[0]["context_label"] == "P1"

    summ = await client.get(
        f"/studios/{studio_id}/software/{software_id}/token-usage/summary"
    )
    assert summ.status_code == 200
    s = summ.json()
    assert "input_tokens" in s and "output_tokens" in s
    assert "estimated_cost_usd" in s
    assert "period_start" in s and "period_end" in s

    patch = await client.patch(
        f"/software/{software_id}/projects/{pid}",
        json={"archived": True},
    )
    assert patch.status_code == 200
    assert patch.json()["archived"] is True

    listed = await client.get(f"/software/{software_id}/projects")
    assert listed.status_code == 200
    assert listed.json() == []

    listed_all = await client.get(
        f"/software/{software_id}/projects",
        params={"include_archived": "true"},
    )
    assert listed_all.status_code == 200
    assert len(listed_all.json()) == 1


@pytest.mark.asyncio
async def test_software_workspace_requires_auth(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    sfx = uuid.uuid4().hex[:8]
    _, _, software_id = await _studio_software(client, db_session, sfx)
    client.cookies.clear()
    r = await client.get(f"/software/{software_id}/attention")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_cross_studio_viewer_cannot_access_attention_feed(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token_ta = await _register(client, sfx, "sw_x_owner")
    client.cookies.set("atelier_token", token_ta)
    studio_a = (
        await post_admin_studio(client, db_session, user_email=f"sw_x_owner-{sfx}@example.com", json_body={"name": f"SWX{sfx}", "description": ""})
    ).json()["id"]
    sw_id = (
        await client.post(
            f"/studios/{studio_a}/software",
            json={"name": f"SW{sfx}", "description": ""},
        )
    ).json()["id"]
    await client.post(
        f"/software/{sw_id}/projects",
        json={"name": f"P{sfx}", "description": None},
    )

    token_b = await _register(client, sfx, "sw_x_adminb")
    client.cookies.set("atelier_token", token_b)
    studio_b = (
        await post_admin_studio(client, db_session, user_email=f"sw_x_adminb-{sfx}@example.com", json_body={"name": f"SWXB{sfx}", "description": ""})
    ).json()["id"]

    token_m = await _register(client, sfx, "sw_x_memberb")
    client.cookies.set("atelier_token", token_b)
    inv = await client.post(
        f"/studios/{studio_b}/members",
        json={"email": f"sw_x_memberb-{sfx}@example.com", "role": "studio_member"},
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
    att = await client.get(f"/software/{sw_id}/attention")
    assert att.status_code == 403
    assert att.json()["code"] == "FORBIDDEN"


@pytest.mark.asyncio
async def test_studio_viewer_cannot_see_activity_or_upload(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token_viewer = await _register(client, sfx, "viewer")
    token_owner = await _register(client, sfx, "sw_owner_v")
    client.cookies.set("atelier_token", token_owner)
    studio_id = (
        await post_admin_studio(client, db_session, user_email=f"sw_owner_v-{sfx}@example.com", json_body={"name": f"SV{sfx}", "description": ""})
    ).json()["id"]
    add_v = await client.post(
        f"/studios/{studio_id}/members",
        json={"email": f"viewer-{sfx}@example.com", "role": "studio_viewer"},
    )
    assert add_v.status_code == 200

    sw = await client.post(
        f"/studios/{studio_id}/software",
        json={"name": "SW", "description": None},
    )
    software_id = sw.json()["id"]

    client.cookies.set("atelier_token", token_viewer)

    act = await client.get(f"/software/{software_id}/activity")
    assert act.status_code == 403
    assert act.json()["code"] == "FORBIDDEN"

    up = await client.post(
        f"/software/{software_id}/artifacts",
        files={"file": ("n.md", b"x", "text/markdown")},
        data={"name": "N"},
    )
    assert up.status_code == 403
    assert up.json()["code"] == "FORBIDDEN"


@pytest.mark.asyncio
async def test_software_workspace_upload_empty_file_rejected(
    client: AsyncClient,
    db_session: object,
    fake_embed: None,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _, software_id = await _studio_software(client, db_session, sfx)
    client.cookies.set("atelier_token", token)
    empty = await client.post(
        f"/software/{software_id}/artifacts",
        files={"file": ("empty.md", b"", "text/markdown")},
        data={"name": "E"},
    )
    assert empty.status_code == 422
    assert empty.json()["code"] == "EMPTY_FILE"


@pytest.mark.asyncio
async def test_software_workspace_upload_storage_error_multipart(
    client: AsyncClient,
    db_session: object,
    fake_embed: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _, software_id = await _studio_software(client, db_session, sfx)
    client.cookies.set("atelier_token", token)

    from app.storage.minio_storage import StorageClient

    async def put_fail(_self: object, *_a: object, **_k: object) -> None:
        raise RuntimeError("minio down")

    monkeypatch.setattr(StorageClient, "put_bytes", put_fail)

    up = await client.post(
        f"/software/{software_id}/artifacts",
        files={"file": ("n.md", b"# hi\n", "text/markdown")},
        data={"name": "N"},
    )
    assert up.status_code == 502
    assert up.json()["code"] == "STORAGE_ERROR"


@pytest.mark.asyncio
async def test_software_workspace_markdown_storage_error(
    client: AsyncClient,
    db_session: object,
    fake_embed: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _, software_id = await _studio_software(client, db_session, sfx)
    client.cookies.set("atelier_token", token)

    from app.storage.minio_storage import StorageClient

    async def put_fail(_self: object, *_a: object, **_k: object) -> None:
        raise RuntimeError("minio down")

    monkeypatch.setattr(StorageClient, "put_bytes", put_fail)

    md = await client.post(
        f"/software/{software_id}/artifacts/md",
        json={"name": "Doc", "content": "# Hello"},
    )
    assert md.status_code == 502
    assert md.json()["code"] == "STORAGE_ERROR"
