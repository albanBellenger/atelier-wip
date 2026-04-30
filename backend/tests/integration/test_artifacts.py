"""Slice 5: artifacts API."""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models import User


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


async def _promote_tool_admin(db_session, email: str) -> None:
    r = await db_session.execute(select(User).where(User.email == email))
    u = r.scalar_one()
    u.is_tool_admin = True
    await db_session.commit()


@pytest.fixture(autouse=True)
def _noop_embed_tasks(monkeypatch: pytest.MonkeyPatch) -> None:
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
    async def ready(_self: object) -> tuple[str, str, str]:
        return ("text-embedding-3-small", "sk-fake", "openai")

    async def batch(_self: object, texts: list[str]) -> list[list[float]]:
        return [[0.0] * 1536 for _ in texts]

    from app.services.embedding_service import EmbeddingService

    monkeypatch.setattr(EmbeddingService, "require_embedding_ready", ready)
    monkeypatch.setattr(EmbeddingService, "embed_batch", batch)


@pytest.mark.asyncio
async def test_artifacts_upload_list_download_delete(
    client: AsyncClient,
    db_session,
    fake_embed: None,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _sid, _sfid, pid = await _studio_project(client, sfx)
    owner_email = f"owner-{sfx}@example.com"
    await _promote_tool_admin(db_session, owner_email)

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

    md_bytes = b"# Hello\n\nworld"
    up = await client.post(
        f"/projects/{pid}/artifacts",
        files={"file": ("notes.md", md_bytes, "text/markdown")},
        data={"name": "Notes"},
    )
    assert up.status_code == 200, up.text
    aid = up.json()["id"]
    assert up.json()["file_type"] == "md"

    listed = await client.get(f"/projects/{pid}/artifacts")
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    dl = await client.get(f"/projects/{pid}/artifacts/{aid}/download")
    assert dl.status_code == 200
    assert dl.content == md_bytes

    deleted = await client.delete(f"/projects/{pid}/artifacts/{aid}")
    assert deleted.status_code == 204

    empty = await client.get(f"/projects/{pid}/artifacts")
    assert empty.json() == []


@pytest.mark.asyncio
async def test_artifacts_md_create_and_rbac(
    client: AsyncClient,
    db_session,
    fake_embed: None,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, studio_id, software_id, pid = await _studio_project(client, sfx)
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

    client.cookies.set("atelier_token", token)
    await client.post(
        f"/studios/{studio_id}/members",
        json={"email": f"member-{sfx}@example.com", "role": "studio_member"},
    )
    client.cookies.set("atelier_token", await _register(client, sfx, "member"))
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
    await _promote_tool_admin(db_session, f"owner-{sfx}@example.com")
    client.cookies.set("atelier_token", token)

    async def boom(_self: object) -> tuple[str, str, str]:
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
