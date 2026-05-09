"""Studios activity feed and studio-level artifact uploads (coverage)."""

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
async def test_studio_viewer_cannot_list_studio_activity(
    client: AsyncClient,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token_viewer = await _register(client, sfx, "viewer")
    token_owner = await _register(client, sfx, "st_owner")
    client.cookies.set("atelier_token", token_owner)
    studio_id = (
        await client.post("/studios", json={"name": f"STA{sfx}", "description": ""})
    ).json()["id"]
    inv = await client.post(
        f"/studios/{studio_id}/members",
        json={"email": f"viewer-{sfx}@example.com", "role": "studio_viewer"},
    )
    assert inv.status_code == 200

    client.cookies.set("atelier_token", token_viewer)
    act = await client.get(f"/studios/{studio_id}/activity")
    assert act.status_code == 403
    assert act.json()["code"] == "FORBIDDEN"


@pytest.mark.asyncio
async def test_studio_artifact_upload_empty_file(
    client: AsyncClient,
    db_session: object,
    fake_embed: None,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token = await _register(client, sfx, "owner_e")
    client.cookies.set("atelier_token", token)
    studio_id = (
        await client.post("/studios", json={"name": f"STE{sfx}", "description": ""})
    ).json()["id"]

    empty = await client.post(
        f"/studios/{studio_id}/artifacts",
        files={"file": ("empty.md", b"", "text/markdown")},
        data={"name": "E"},
    )
    assert empty.status_code == 422
    assert empty.json()["code"] == "EMPTY_FILE"


@pytest.mark.asyncio
async def test_studio_artifact_upload_storage_error(
    client: AsyncClient,
    db_session: object,
    fake_embed: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token = await _register(client, sfx, "owner_se")
    client.cookies.set("atelier_token", token)
    studio_id = (
        await client.post("/studios", json={"name": f"STS{sfx}", "description": ""})
    ).json()["id"]

    from app.storage.minio_storage import StorageClient

    async def put_fail(_self: object, *_a: object, **_k: object) -> None:
        raise RuntimeError("minio down")

    monkeypatch.setattr(StorageClient, "put_bytes", put_fail)

    up = await client.post(
        f"/studios/{studio_id}/artifacts",
        files={"file": ("n.md", b"# x\n", "text/markdown")},
        data={"name": "N"},
    )
    assert up.status_code == 502
    assert up.json()["code"] == "STORAGE_ERROR"


@pytest.mark.asyncio
async def test_studio_markdown_artifact_storage_error(
    client: AsyncClient,
    db_session: object,
    fake_embed: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token = await _register(client, sfx, "owner_md")
    client.cookies.set("atelier_token", token)
    studio_id = (
        await client.post("/studios", json={"name": f"STM{sfx}", "description": ""})
    ).json()["id"]

    from app.storage.minio_storage import StorageClient

    async def put_fail(_self: object, *_a: object, **_k: object) -> None:
        raise RuntimeError("minio down")

    monkeypatch.setattr(StorageClient, "put_bytes", put_fail)

    md = await client.post(
        f"/studios/{studio_id}/artifacts/md",
        json={"name": "Doc", "content": "# Hello"},
    )
    assert md.status_code == 502
    assert md.json()["code"] == "STORAGE_ERROR"
