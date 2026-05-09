"""Slice 5: artifacts API."""

import uuid

import pytest
from httpx import AsyncClient

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


async def _studio_project(client: AsyncClient, sfx: str) -> tuple[str, str, str, str]:
    """token, studio_id, software_id, project_id."""
    token = await _register(client, sfx, "owner")
    client.cookies.set("atelier_token", token)
    cr = await client.post("/studios", json={"name": f"S{sfx}", "description": "d"})
    assert cr.status_code == 200
    studio_id = cr.json()["id"]
    sw = await client.post(
        f"/studios/{studio_id}/software",
        json={"name": "SW", "description": None},
    )
    assert sw.status_code == 200
    software_id = sw.json()["id"]
    pr = await client.post(
        f"/software/{software_id}/projects",
        json={"name": "P1", "description": None},
    )
    assert pr.status_code == 200
    project_id = pr.json()["id"]
    return token, studio_id, software_id, project_id


@pytest.fixture(autouse=True)
def _noop_embed_tasks(monkeypatch: pytest.MonkeyPatch) -> None:
    async def noop(*_a: object, **_k: object) -> None:
        return None

    monkeypatch.setattr(
        "app.services.embedding_pipeline.enqueue_artifact_embedding",
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

    async def put_bytes(_self, object_name: str, data: bytes, _content_type: str) -> None:
        store[object_name] = data

    async def get_bytes(_self, object_name: str) -> bytes:
        return store[object_name]

    async def remove(_self, object_name: str) -> None:
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
async def test_artifacts_upload_list_download_delete(
    client: AsyncClient,
    db_session,
    fake_embed: None,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _sid, _sfid, pid = await _studio_project(client, sfx)
    client.cookies.set("atelier_token", token)

    md_bytes = b"# Hello\n\nworld"
    up = await client.post(
        f"/projects/{pid}/artifacts",
        files={"file": ("notes.md", md_bytes, "text/markdown")},
        data={"name": "Notes"},
    )
    assert up.status_code == 200, up.text
    aid = up.json()["id"]
    assert up.json()["file_type"] == "md"
    assert up.json()["size_bytes"] == len(md_bytes)

    listed = await client.get(f"/projects/{pid}/artifacts")
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    row0 = listed.json()[0]
    assert row0["size_bytes"] == len(md_bytes)
    assert "embedding_status" in row0
    assert row0["embedding_status"] == "embedded"
    assert row0.get("chunk_count") is not None
    assert row0["chunk_count"] >= 1

    dl = await client.get(f"/projects/{pid}/artifacts/{aid}/download")
    assert dl.status_code == 200
    assert dl.content == md_bytes

    deleted = await client.delete(f"/projects/{pid}/artifacts/{aid}")
    assert deleted.status_code == 204

    empty = await client.get(f"/projects/{pid}/artifacts")
    assert empty.json() == []


@pytest.mark.asyncio
async def test_artifacts_project_download_storage_read_error(
    client: AsyncClient,
    db_session: object,
    fake_embed: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _sid, _sfid, pid = await _studio_project(client, sfx)
    client.cookies.set("atelier_token", token)
    up = await client.post(
        f"/projects/{pid}/artifacts",
        files={"file": ("d.md", b"# d\n", "text/markdown")},
        data={"name": "D"},
    )
    assert up.status_code == 200, up.text
    aid = up.json()["id"]

    from app.storage.minio_storage import StorageClient

    async def get_bytes_fail(_self: object, *_a: object, **_k: object) -> bytes:
        raise RuntimeError("read fail")

    monkeypatch.setattr(StorageClient, "get_bytes", get_bytes_fail)

    dl = await client.get(f"/projects/{pid}/artifacts/{aid}/download")
    assert dl.status_code == 502
    assert dl.json()["code"] == "STORAGE_ERROR"


@pytest.mark.asyncio
async def test_artifacts_md_create_and_rbac(
    client: AsyncClient,
    db_session,
    fake_embed: None,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, studio_id, software_id, pid = await _studio_project(client, sfx)
    client.cookies.set("atelier_token", token)

    cr = await client.post(
        f"/projects/{pid}/artifacts/md",
        json={"name": "Doc", "content": "# x"},
    )
    assert cr.status_code == 200
    assert cr.json()["name"] == "Doc"

    outsider = await _register(client, sfx, "out")
    client.cookies.set("atelier_token", outsider)
    forbidden = await client.post(
        f"/projects/{pid}/artifacts/md",
        json={"name": "Nope", "content": ""},
    )
    assert forbidden.status_code == 403

    member_token = await _register(client, sfx, "member")
    client.cookies.set("atelier_token", token)
    add_m = await client.post(
        f"/studios/{studio_id}/members",
        json={"email": f"member-{sfx}@example.com", "role": "studio_member"},
    )
    assert add_m.status_code == 200, add_m.text
    client.cookies.set("atelier_token", member_token)
    ok_list = await client.get(f"/projects/{pid}/artifacts")
    assert ok_list.status_code == 200
    assert len(ok_list.json()) >= 1


@pytest.mark.asyncio
async def test_artifacts_requires_embedding_config(
    client: AsyncClient,
    db_session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _sid, _sfid, pid = await _studio_project(client, sfx)
    client.cookies.set("atelier_token", token)

    async def boom(_self: object, _studio_id: object) -> tuple[str, str, str, str]:
        from app.exceptions import ApiError

        raise ApiError(
            status_code=503,
            code="EMBEDDING_NOT_CONFIGURED",
            message="not configured",
        )

    from app.services.embedding_service import EmbeddingService

    monkeypatch.setattr(EmbeddingService, "require_embedding_ready", boom)

    up = await client.post(
        f"/projects/{pid}/artifacts",
        files={"file": ("x.md", b"# x", "text/markdown")},
    )
    assert up.status_code == 503


@pytest.mark.asyncio
async def test_upload_storage_error_does_not_leave_orphan(
    client: AsyncClient,
    db_session,
    fake_embed: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _sid, _sfid, pid = await _studio_project(client, sfx)
    client.cookies.set("atelier_token", token)

    from app.storage.minio_storage import StorageClient

    async def put_bytes_fail(_self: object, *_a: object, **_k: object) -> None:
        raise RuntimeError("minio down")

    monkeypatch.setattr(StorageClient, "put_bytes", put_bytes_fail)

    up = await client.post(
        f"/projects/{pid}/artifacts",
        files={"file": ("notes.md", b"# Hello\n", "text/markdown")},
        data={"name": "Notes"},
    )
    assert up.status_code == 502
    assert up.json()["code"] == "STORAGE_ERROR"

    listed = await client.get(f"/projects/{pid}/artifacts")
    assert listed.status_code == 200
    assert listed.json() == []


@pytest.mark.asyncio
async def test_delete_artifact_minio_failure_still_returns_204(
    client: AsyncClient,
    db_session,
    fake_embed: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _sid, _sfid, pid = await _studio_project(client, sfx)
    client.cookies.set("atelier_token", token)

    md_bytes = b"# Hello\n\nworld"
    up = await client.post(
        f"/projects/{pid}/artifacts",
        files={"file": ("notes.md", md_bytes, "text/markdown")},
        data={"name": "Notes"},
    )
    assert up.status_code == 200, up.text
    aid = up.json()["id"]

    from app.storage.minio_storage import StorageClient

    async def remove_fail(_self: object, *_a: object, **_k: object) -> None:
        raise RuntimeError("minio down")

    monkeypatch.setattr(StorageClient, "remove", remove_fail)

    deleted = await client.delete(f"/projects/{pid}/artifacts/{aid}")
    assert deleted.status_code == 204

    empty = await client.get(f"/projects/{pid}/artifacts")
    assert empty.json() == []


@pytest.mark.asyncio
async def test_cross_studio_viewer_can_download_artifact(
    client: AsyncClient,
    db_session,
    fake_embed: None,
) -> None:
    import uuid as u

    from sqlalchemy import select

    from app.models import CrossStudioAccess, User

    sfx = u.uuid4().hex[:8]
    token_b = await _register(client, sfx, "ownerb")
    client.cookies.set("atelier_token", token_b)
    sb = (await client.post("/studios", json={"name": f"SB{sfx}"})).json()
    studio_b_id = sb["id"]
    sw_b = (
        await client.post(
            f"/studios/{studio_b_id}/software",
            json={"name": "sw"},
        )
    ).json()
    software_b_id = sw_b["id"]
    pid_b = (
        await client.post(
            f"/software/{software_b_id}/projects",
            json={"name": "P"},
        )
    ).json()["id"]

    client.cookies.set("atelier_token", token_b)
    md_bytes = b"# cross"
    up = await client.post(
        f"/projects/{pid_b}/artifacts",
        files={"file": ("n.md", md_bytes, "text/markdown")},
        data={"name": "N"},
    )
    assert up.status_code == 200, up.text
    aid = up.json()["id"]

    token_a = await _register(client, sfx, "ownera")
    client.cookies.set("atelier_token", token_a)
    sa = (await client.post("/studios", json={"name": f"SA{sfx}"})).json()
    studio_a_id = sa["id"]
    me_a = (await client.get("/auth/me")).json()
    user_a_id = u.UUID(me_a["user"]["id"])

    r_b = await db_session.execute(
        select(User).where(User.email == f"ownerb-{sfx}@example.com")
    )
    user_b = r_b.scalar_one()

    db_session.add(
        CrossStudioAccess(
            id=u.uuid4(),
            requesting_studio_id=u.UUID(studio_a_id),
            target_software_id=u.UUID(software_b_id),
            requested_by=user_a_id,
            approved_by=user_b.id,
            access_level="viewer",
            status="approved",
        )
    )
    await db_session.flush()

    client.cookies.set("atelier_token", token_a)
    dl = await client.get(f"/projects/{pid_b}/artifacts/{aid}/download")
    assert dl.status_code == 200
    assert dl.content == md_bytes

    stranger = await _register(client, sfx, "stranger")
    client.cookies.set("atelier_token", stranger)
    forbidden = await client.get(f"/projects/{pid_b}/artifacts/{aid}/download")
    assert forbidden.status_code == 403


@pytest.mark.asyncio
async def test_delete_project_artifact_studio_member_forbidden(
    client: AsyncClient,
    db_session,
    fake_embed: None,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, studio_id, _software_id, pid = await _studio_project(client, sfx)
    client.cookies.set("atelier_token", token)
    up = await client.post(
        f"/projects/{pid}/artifacts/md",
        json={"name": "keep.md", "content": "# x"},
    )
    assert up.status_code == 200
    aid = up.json()["id"]

    member_lbl = "memberdel"
    member_token = await _register(client, sfx, member_lbl)
    client.cookies.set("atelier_token", token)
    add_m = await client.post(
        f"/studios/{studio_id}/members",
        json={"email": f"{member_lbl}-{sfx}@example.com", "role": "studio_member"},
    )
    assert add_m.status_code == 200, add_m.text
    client.cookies.set("atelier_token", member_token)
    forbidden = await client.delete(f"/projects/{pid}/artifacts/{aid}")
    assert forbidden.status_code == 403


@pytest.mark.asyncio
async def test_cross_studio_viewer_cannot_delete_or_reindex_project_artifact(
    client: AsyncClient,
    db_session,
    fake_embed: None,
) -> None:
    import uuid as u

    from sqlalchemy import select

    from app.models import CrossStudioAccess, User

    sfx = u.uuid4().hex[:8]
    token_b = await _register(client, sfx, "ownerbd")
    client.cookies.set("atelier_token", token_b)
    sb = (await client.post("/studios", json={"name": f"SBD{sfx}"})).json()
    studio_b_id = sb["id"]
    sw_b = (
        await client.post(
            f"/studios/{studio_b_id}/software",
            json={"name": "sw"},
        )
    ).json()
    software_b_id = sw_b["id"]
    pid_b = (
        await client.post(
            f"/software/{software_b_id}/projects",
            json={"name": "P"},
        )
    ).json()["id"]

    client.cookies.set("atelier_token", token_b)
    up = await client.post(
        f"/projects/{pid_b}/artifacts/md",
        json={"name": "v.md", "content": "# v"},
    )
    assert up.status_code == 200
    aid = up.json()["id"]

    token_a = await _register(client, sfx, "ownerad")
    client.cookies.set("atelier_token", token_a)
    sa = (await client.post("/studios", json={"name": f"SAD{sfx}"})).json()
    studio_a_id = sa["id"]
    me_a = (await client.get("/auth/me")).json()
    user_a_id = u.UUID(me_a["user"]["id"])

    r_b = await db_session.execute(
        select(User).where(User.email == f"ownerbd-{sfx}@example.com")
    )
    user_b = r_b.scalar_one()

    db_session.add(
        CrossStudioAccess(
            id=u.uuid4(),
            requesting_studio_id=u.UUID(studio_a_id),
            target_software_id=u.UUID(software_b_id),
            requested_by=user_a_id,
            approved_by=user_b.id,
            access_level="viewer",
            status="approved",
        )
    )
    await db_session.flush()

    client.cookies.set("atelier_token", token_a)
    dl = await client.get(f"/projects/{pid_b}/artifacts/{aid}/download")
    assert dl.status_code == 200
    del_r = await client.delete(f"/projects/{pid_b}/artifacts/{aid}")
    assert del_r.status_code == 403
    re_idx = await client.post(f"/projects/{pid_b}/artifacts/{aid}/reindex")
    assert re_idx.status_code == 403


@pytest.mark.asyncio
async def test_reindex_project_artifact_studio_member_invokes_embed(
    client: AsyncClient,
    db_session,
    fake_embed: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    called: list[object] = []

    async def track_embed(_session: object, artifact_id: object) -> None:
        called.append(artifact_id)

    sfx = uuid.uuid4().hex[:8]
    token, studio_id, _sfid, pid = await _studio_project(client, sfx)
    client.cookies.set("atelier_token", token)
    up = await client.post(
        f"/projects/{pid}/artifacts/md",
        json={"name": "r.md", "content": "# r"},
    )
    assert up.status_code == 200
    aid = up.json()["id"]

    monkeypatch.setattr(
        "app.services.embedding_pipeline.embed_artifact_in_upload_session",
        track_embed,
    )

    member_lbl = "reidxmem"
    member_token = await _register(client, sfx, member_lbl)
    client.cookies.set("atelier_token", token)
    add_m = await client.post(
        f"/studios/{studio_id}/members",
        json={"email": f"{member_lbl}-{sfx}@example.com", "role": "studio_member"},
    )
    assert add_m.status_code == 200, add_m.text
    client.cookies.set("atelier_token", member_token)
    r = await client.post(f"/projects/{pid}/artifacts/{aid}/reindex")
    assert r.status_code == 204
    assert len(called) == 1


@pytest.mark.asyncio
async def test_chunking_strategy_get_requires_auth(client: AsyncClient) -> None:
    r = await client.get("/artifacts/chunking-strategies")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_patch_chunking_strategy_studio_member_forbidden(
    client: AsyncClient,
    db_session,
    fake_embed: None,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, studio_id, _sfid, pid = await _studio_project(client, sfx)
    client.cookies.set("atelier_token", token)
    up = await client.post(
        f"/projects/{pid}/artifacts/md",
        json={"name": "c.md", "content": "# c"},
    )
    assert up.status_code == 200
    aid = up.json()["id"]

    member_lbl = "chunkmem"
    member_token = await _register(client, sfx, member_lbl)
    client.cookies.set("atelier_token", token)
    add_m = await client.post(
        f"/studios/{studio_id}/members",
        json={"email": f"{member_lbl}-{sfx}@example.com", "role": "studio_member"},
    )
    assert add_m.status_code == 200, add_m.text
    client.cookies.set("atelier_token", member_token)
    bad = await client.patch(
        f"/artifacts/{aid}/chunking-strategy",
        json={"chunking_strategy": "sentence"},
    )
    assert bad.status_code == 403


@pytest.mark.asyncio
async def test_patch_chunking_strategy_owner_ok(
    client: AsyncClient,
    db_session,
    fake_embed: None,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _sid, _sfid, pid = await _studio_project(client, sfx)
    client.cookies.set("atelier_token", token)
    up = await client.post(
        f"/projects/{pid}/artifacts/md",
        json={"name": "c2.md", "content": "# c"},
    )
    assert up.status_code == 200
    aid = up.json()["id"]

    ok = await client.patch(
        f"/artifacts/{aid}/chunking-strategy",
        json={"chunking_strategy": "sentence"},
    )
    assert ok.status_code == 200, ok.text
    body = ok.json()
    assert body["chunking_strategy"] == "sentence"
