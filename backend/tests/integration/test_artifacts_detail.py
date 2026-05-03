"""GET artifact detail (RAG indexing) — Phase 1."""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models import Artifact, ArtifactChunk, CrossStudioAccess, User
from app.services.embedding_service import OPENAI_EMBEDDINGS_URL


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


async def _promote_tool_admin(db_session, email: str) -> None:
    r = await db_session.execute(select(User).where(User.email == email))
    u = r.scalar_one()
    u.is_tool_admin = True
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
    async def ready(_self: object) -> tuple[str, str, str, str]:
        return ("text-embedding-3-small", "sk-fake", "openai", OPENAI_EMBEDDINGS_URL)

    async def batch(_self: object, texts: list[str]) -> list[list[float]]:
        return [[0.0] * 1536 for _ in texts]

    from app.services.embedding_service import EmbeddingService

    monkeypatch.setattr(EmbeddingService, "require_embedding_ready", ready)
    monkeypatch.setattr(EmbeddingService, "embed_batch", batch)


async def _seed_embedded_artifact_with_chunk(
    db_session: object, artifact_id: uuid.UUID
) -> None:
    r = await db_session.execute(select(Artifact).where(Artifact.id == artifact_id))
    art = r.scalar_one()
    art.embedding_status = "embedded"
    art.embedded_at = art.created_at
    art.extracted_char_count = 12
    art.chunk_count = 1
    art.embedding_error = None
    db_session.add(
        ArtifactChunk(
            artifact_id=artifact_id,
            chunk_index=0,
            content="preview text for chunk zero",
            embedding=[0.0] * 1536,
        )
    )
    await db_session.flush()


@pytest.mark.asyncio
async def test_artifact_detail_member_sees_chunk_previews(
    client: AsyncClient,
    db_session,
    fake_embed: None,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _studio_id, _sfid, pid = await _studio_project(client, sfx)
    await _promote_tool_admin(db_session, f"owner-{sfx}@example.com")
    client.cookies.set("atelier_token", token)
    await client.put(
        "/admin/config",
        json={
            "embedding_provider": "openai",
            "embedding_model": "text-embedding-3-small",
            "embedding_api_key": "sk-test",
        },
    )
    up = await client.post(
        f"/projects/{pid}/artifacts",
        files={"file": ("n.md", b"# Hi", "text/markdown")},
        data={"name": "N"},
    )
    assert up.status_code == 200, up.text
    aid = uuid.UUID(up.json()["id"])
    await _seed_embedded_artifact_with_chunk(db_session, aid)

    r = await client.get(f"/projects/{pid}/artifacts/{aid}")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["embedding_status"] == "embedded"
    assert body["chunk_count"] == 1
    assert body["extracted_char_count"] == 12
    assert len(body["chunk_previews"]) == 1
    assert body["chunk_previews"][0]["chunk_index"] == 0
    assert "preview text" in body["chunk_previews"][0]["content"]


@pytest.mark.asyncio
async def test_artifact_detail_viewer_no_chunk_previews(
    client: AsyncClient,
    db_session,
    fake_embed: None,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, studio_id, _sfid, pid = await _studio_project(client, sfx)
    await _promote_tool_admin(db_session, f"owner-{sfx}@example.com")
    client.cookies.set("atelier_token", token)
    await client.put(
        "/admin/config",
        json={
            "embedding_provider": "openai",
            "embedding_model": "text-embedding-3-small",
            "embedding_api_key": "sk-test",
        },
    )
    up = await client.post(
        f"/projects/{pid}/artifacts",
        files={"file": ("v.md", b"# V", "text/markdown")},
        data={"name": "V"},
    )
    assert up.status_code == 200, up.text
    aid = uuid.UUID(up.json()["id"])
    await _seed_embedded_artifact_with_chunk(db_session, aid)

    vtok = await _register(client, sfx, "viewer")
    client.cookies.set("atelier_token", token)
    inv = await client.post(
        f"/studios/{studio_id}/members",
        json={
            "email": f"viewer-{sfx}@example.com",
            "display_name": "V",
            "role": "studio_viewer",
        },
    )
    assert inv.status_code == 200, inv.text

    client.cookies.set("atelier_token", vtok)
    r = await client.get(f"/projects/{pid}/artifacts/{aid}")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["embedding_status"] == "embedded"
    assert body["chunk_count"] == 1
    assert body["chunk_previews"] == []


@pytest.mark.asyncio
async def test_artifact_detail_unauthenticated_401(
    client: AsyncClient,
    db_session,
    fake_embed: None,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _sid, _sfid, pid = await _studio_project(client, sfx)
    await _promote_tool_admin(db_session, f"owner-{sfx}@example.com")
    client.cookies.set("atelier_token", token)
    await client.put(
        "/admin/config",
        json={
            "embedding_provider": "openai",
            "embedding_model": "text-embedding-3-small",
            "embedding_api_key": "sk-test",
        },
    )
    up = await client.post(
        f"/projects/{pid}/artifacts",
        files={"file": ("a.md", b"# A", "text/markdown")},
        data={"name": "A"},
    )
    aid = up.json()["id"]
    client.cookies.clear()
    r = await client.get(f"/projects/{pid}/artifacts/{aid}")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_artifact_detail_wrong_studio_forbidden(
    client: AsyncClient,
    db_session,
    fake_embed: None,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token_a, _sa, _sfa, pid_a = await _studio_project(client, sfx)
    await _promote_tool_admin(db_session, f"owner-{sfx}@example.com")
    client.cookies.set("atelier_token", token_a)
    await client.put(
        "/admin/config",
        json={
            "embedding_provider": "openai",
            "embedding_model": "text-embedding-3-small",
            "embedding_api_key": "sk-test",
        },
    )
    up = await client.post(
        f"/projects/{pid_a}/artifacts",
        files={"file": ("a.md", b"# A", "text/markdown")},
        data={"name": "A"},
    )
    aid = up.json()["id"]

    token_b = await _register(client, sfx, "other")
    client.cookies.set("atelier_token", token_b)
    r = await client.get(f"/projects/{pid_a}/artifacts/{aid}")
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_artifact_detail_cross_studio_stranger_forbidden(
    client: AsyncClient,
    db_session,
    fake_embed: None,
) -> None:
    sfx = uuid.uuid4().hex[:8]
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

    await _promote_tool_admin(db_session, f"ownerb-{sfx}@example.com")
    client.cookies.set("atelier_token", token_b)
    await client.put(
        "/admin/config",
        json={
            "embedding_provider": "openai",
            "embedding_model": "text-embedding-3-small",
            "embedding_api_key": "sk-test",
        },
    )
    up = await client.post(
        f"/projects/{pid_b}/artifacts",
        files={"file": ("n.md", b"# x", "text/markdown")},
        data={"name": "N"},
    )
    assert up.status_code == 200, up.text
    aid = up.json()["id"]

    stranger = await _register(client, sfx, "stranger")
    client.cookies.set("atelier_token", stranger)
    r = await client.get(f"/projects/{pid_b}/artifacts/{aid}")
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_artifact_detail_invalid_project_uuid_422(
    client: AsyncClient,
    db_session,
    fake_embed: None,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _sid, _sfid, pid = await _studio_project(client, sfx)
    await _promote_tool_admin(db_session, f"owner-{sfx}@example.com")
    client.cookies.set("atelier_token", token)
    await client.put(
        "/admin/config",
        json={
            "embedding_provider": "openai",
            "embedding_model": "text-embedding-3-small",
            "embedding_api_key": "sk-test",
        },
    )
    up = await client.post(
        f"/projects/{pid}/artifacts",
        files={"file": ("a.md", b"# A", "text/markdown")},
        data={"name": "A"},
    )
    aid = up.json()["id"]
    r = await client.get(f"/projects/not-a-uuid/artifacts/{aid}")
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_artifact_detail_unknown_artifact_404(
    client: AsyncClient,
    db_session,
    fake_embed: None,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _sid, _sfid, pid = await _studio_project(client, sfx)
    await _promote_tool_admin(db_session, f"owner-{sfx}@example.com")
    client.cookies.set("atelier_token", token)
    await client.put(
        "/admin/config",
        json={
            "embedding_provider": "openai",
            "embedding_model": "text-embedding-3-small",
            "embedding_api_key": "sk-test",
        },
    )
    bad = uuid.uuid4()
    r = await client.get(f"/projects/{pid}/artifacts/{bad}")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_artifact_detail_by_id_cross_studio_viewer_no_previews(
    client: AsyncClient,
    db_session,
    fake_embed: None,
) -> None:
    import uuid as u

    from sqlalchemy import select as sel

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

    await _promote_tool_admin(db_session, f"ownerb-{sfx}@example.com")
    client.cookies.set("atelier_token", token_b)
    await client.put(
        "/admin/config",
        json={
            "embedding_provider": "openai",
            "embedding_model": "text-embedding-3-small",
            "embedding_api_key": "sk-test",
        },
    )
    up = await client.post(
        f"/projects/{pid_b}/artifacts",
        files={"file": ("n.md", b"# cross", "text/markdown")},
        data={"name": "N"},
    )
    assert up.status_code == 200, up.text
    aid = u.UUID(up.json()["id"])
    await _seed_embedded_artifact_with_chunk(db_session, aid)

    token_a = await _register(client, sfx, "ownera")
    client.cookies.set("atelier_token", token_a)
    sa = (await client.post("/studios", json={"name": f"SA{sfx}"})).json()
    studio_a_id = sa["id"]
    me_a = (await client.get("/auth/me")).json()
    user_a_id = u.UUID(me_a["user"]["id"])

    r_b = await db_session.execute(
        sel(User).where(User.email == f"ownerb-{sfx}@example.com")
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
    r = await client.get(f"/artifacts/{aid}")
    assert r.status_code == 200, r.text
    assert r.json()["chunk_previews"] == []
