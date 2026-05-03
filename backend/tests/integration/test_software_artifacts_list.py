"""GET /software/{id}/artifacts — aggregate artifacts across projects."""

from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models import User
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


async def _promote_tool_admin(db_session, email: str) -> None:
    r = await db_session.execute(select(User).where(User.email == email))
    u = r.scalar_one()
    u.is_tool_admin = True
    await db_session.flush()


@pytest.mark.asyncio
async def test_software_artifacts_unauthorized(client: AsyncClient) -> None:
    r = await client.get(f"/software/{uuid.uuid4()}/artifacts")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_software_artifacts_outsider_forbidden(
    client: AsyncClient,
    db_session,
    fake_embed: None,
) -> None:
    sfx = uuid.uuid4().hex[:8]
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

    outsider = await _register(client, sfx, "out")
    client.cookies.set("atelier_token", outsider)
    r = await client.get(f"/software/{software_id}/artifacts")
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_software_artifacts_lists_across_projects(
    client: AsyncClient,
    db_session,
    fake_embed: None,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token = await _register(client, sfx, "owner")
    await _promote_tool_admin(db_session, f"owner-{sfx}@example.com")
    client.cookies.set("atelier_token", token)
    put_cfg = await client.put(
        "/admin/config",
        json={
            "embedding_provider": "openai",
            "embedding_model": "text-embedding-3-small",
            "embedding_api_key": "sk-test",
        },
    )
    assert put_cfg.status_code == 200, put_cfg.text

    cr = await client.post("/studios", json={"name": f"S{sfx}", "description": "d"})
    assert cr.status_code == 200
    studio_id = cr.json()["id"]
    sw = await client.post(
        f"/studios/{studio_id}/software",
        json={"name": "SW", "description": None},
    )
    assert sw.status_code == 200
    software_id = sw.json()["id"]

    p1 = await client.post(
        f"/software/{software_id}/projects",
        json={"name": "Alpha", "description": None},
    )
    assert p1.status_code == 200
    pid1 = p1.json()["id"]
    p2 = await client.post(
        f"/software/{software_id}/projects",
        json={"name": "Beta", "description": None},
    )
    assert p2.status_code == 200
    pid2 = p2.json()["id"]

    up1 = await client.post(
        f"/projects/{pid1}/artifacts/md",
        json={"name": "Doc A", "content": "# a"},
    )
    assert up1.status_code == 200
    up2 = await client.post(
        f"/projects/{pid2}/artifacts/md",
        json={"name": "Doc B", "content": "# b"},
    )
    assert up2.status_code == 200

    listed = await client.get(f"/software/{software_id}/artifacts")
    assert listed.status_code == 200
    body = listed.json()
    assert len(body) == 2
    names = {row["name"] for row in body}
    assert names == {"Doc A", "Doc B"}
    projects = {row["project_name"] for row in body}
    assert projects == {"Alpha", "Beta"}
    assert all("uploaded_by_display" in row for row in body)
    assert any(row["uploaded_by_display"] == "owner" for row in body)
    for row in body:
        assert "scope_level" in row
        assert row["scope_level"] == "project"
        assert row.get("excluded_at_software") is None
        assert row.get("excluded_at_project") is None
        assert isinstance(row["size_bytes"], int)
        assert row["size_bytes"] > 0
