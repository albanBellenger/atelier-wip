"""Studio/software scoped artifacts and artifact library API."""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models import User
from app.services.embedding_service import OPENAI_EMBEDDING_API_BASE


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

    async def put_bytes(_self, object_name: str, data: bytes, _content_type: str) -> None:
        store[object_name] = data

    async def get_bytes(_self, object_name: str) -> bytes:
        return store[object_name]

    async def remove(_self, object_name: str) -> None:
        store.pop(object_name, None)

    async def copy_object(
        _self: object, dest_object_name: str, src_object_name: str
    ) -> None:
        if src_object_name in store:
            store[dest_object_name] = store[src_object_name]

    from app.storage.minio_storage import StorageClient

    monkeypatch.setattr(StorageClient, "ensure_bucket", ensure_bucket)
    monkeypatch.setattr(StorageClient, "put_bytes", put_bytes)
    monkeypatch.setattr(StorageClient, "get_bytes", get_bytes)
    monkeypatch.setattr(StorageClient, "remove", remove)
    monkeypatch.setattr(StorageClient, "copy_object", copy_object)


@pytest.fixture
def fake_embed(monkeypatch: pytest.MonkeyPatch) -> None:
    async def ready(_self: object) -> tuple[str, str, str, str]:
        return ("text-embedding-3-small", "sk-fake", "openai", OPENAI_EMBEDDING_API_BASE)

    async def batch(_self: object, texts: list[str], *, context: object | None = None) -> list[list[float]]:
        return [[0.0] * 1536 for _ in texts]

    from app.services.embedding_service import EmbeddingService

    monkeypatch.setattr(EmbeddingService, "require_embedding_ready", ready)
    monkeypatch.setattr(EmbeddingService, "embed_batch", batch)


@pytest.mark.asyncio
async def test_studio_software_upload_and_library_list(
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
    pr = await client.post(
        f"/software/{software_id}/projects",
        json={"name": "P1", "description": None},
    )
    assert pr.status_code == 200
    project_id = pr.json()["id"]

    st_md = await client.post(
        f"/studios/{studio_id}/artifacts/md",
        json={"name": "studio-wide.md", "content": "# s"},
    )
    assert st_md.status_code == 200, st_md.text
    st_body = st_md.json()
    assert st_body["scope_level"] == "studio"
    assert st_body["project_id"] is None

    sw_md = await client.post(
        f"/software/{software_id}/artifacts/md",
        json={"name": "sw-wide.md", "content": "# w"},
    )
    assert sw_md.status_code == 200, sw_md.text
    sw_body = sw_md.json()
    assert sw_body["scope_level"] == "software"
    assert sw_body["project_id"] is None

    pr_md = await client.post(
        f"/projects/{project_id}/artifacts/md",
        json={"name": "proj.md", "content": "# p"},
    )
    assert pr_md.status_code == 200, pr_md.text
    assert pr_md.json()["scope_level"] == "project"

    lib = await client.get(f"/studios/{studio_id}/artifact-library")
    assert lib.status_code == 200, lib.text
    rows = lib.json()
    assert len(rows) == 3
    scopes = {r["scope_level"] for r in rows}
    assert scopes == {"studio", "software", "project"}
    names = {r["name"] for r in rows}
    assert names == {"studio-wide.md", "sw-wide.md", "proj.md"}

    lib_sw = await client.get(
        f"/studios/{studio_id}/artifact-library",
        params={"softwareId": software_id},
    )
    assert lib_sw.status_code == 200, lib_sw.text
    sw_rows = lib_sw.json()
    assert len(sw_rows) == 3
    assert any(r["scope_level"] == "studio" for r in sw_rows)
    assert any(r["name"] == "sw-wide.md" for r in sw_rows)

    dl = await client.get(f"/artifacts/{st_body['id']}/download")
    assert dl.status_code == 200
    dl_sw = await client.get(f"/artifacts/{sw_body['id']}/download")
    assert dl_sw.status_code == 200


@pytest.mark.asyncio
async def test_studio_upload_forbidden_non_member(
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
    assert put_cfg.status_code == 200
    cr = await client.post("/studios", json={"name": f"S{sfx}", "description": "d"})
    studio_id = cr.json()["id"]

    other_tok = await _register(client, sfx + "x", "stranger")
    client.cookies.set("atelier_token", other_tok)
    r403 = await client.post(
        f"/studios/{studio_id}/artifacts/md",
        json={"name": "nope.md", "content": "# n"},
    )
    assert r403.status_code == 403


@pytest.mark.asyncio
async def test_delete_library_artifact_by_id_studio_admin(
    client: AsyncClient,
    db_session,
    fake_embed: None,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token = await _register(client, sfx, "ownlib")
    await _promote_tool_admin(db_session, f"ownlib-{sfx}@example.com")
    client.cookies.set("atelier_token", token)
    await client.put(
        "/admin/config",
        json={
            "embedding_provider": "openai",
            "embedding_model": "text-embedding-3-small",
            "embedding_api_key": "sk-test",
        },
    )
    cr = await client.post("/studios", json={"name": f"S{sfx}", "description": "d"})
    assert cr.status_code == 200
    studio_id = cr.json()["id"]
    st_md = await client.post(
        f"/studios/{studio_id}/artifacts/md",
        json={"name": "del.md", "content": "# d"},
    )
    assert st_md.status_code == 200
    aid = st_md.json()["id"]

    deleted = await client.delete(f"/artifacts/{aid}")
    assert deleted.status_code == 204

    lib = await client.get(f"/studios/{studio_id}/artifact-library")
    assert all(r["id"] != aid for r in lib.json())


@pytest.mark.asyncio
async def test_delete_library_artifact_by_id_non_member_forbidden(
    client: AsyncClient,
    db_session,
    fake_embed: None,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token = await _register(client, sfx, "ownlib2")
    await _promote_tool_admin(db_session, f"ownlib2-{sfx}@example.com")
    client.cookies.set("atelier_token", token)
    await client.put(
        "/admin/config",
        json={
            "embedding_provider": "openai",
            "embedding_model": "text-embedding-3-small",
            "embedding_api_key": "sk-test",
        },
    )
    cr = await client.post("/studios", json={"name": f"S{sfx}", "description": "d"})
    studio_id = cr.json()["id"]
    st_md = await client.post(
        f"/studios/{studio_id}/artifacts/md",
        json={"name": "x.md", "content": "# x"},
    )
    assert st_md.status_code == 200
    aid = st_md.json()["id"]

    other = await _register(client, sfx + "z", "str")
    client.cookies.set("atelier_token", other)
    forbidden = await client.delete(f"/artifacts/{aid}")
    assert forbidden.status_code == 403


@pytest.mark.asyncio
async def test_patch_artifact_scope_studio_then_project_download_ok(
    client: AsyncClient,
    db_session,
    fake_embed: None,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token = await _register(client, sfx, "scopemv")
    await _promote_tool_admin(db_session, f"scopemv-{sfx}@example.com")
    client.cookies.set("atelier_token", token)
    await client.put(
        "/admin/config",
        json={
            "embedding_provider": "openai",
            "embedding_model": "text-embedding-3-small",
            "embedding_api_key": "sk-test",
        },
    )
    cr = await client.post("/studios", json={"name": f"S{sfx}", "description": "d"})
    studio_id = cr.json()["id"]
    sw = await client.post(
        f"/studios/{studio_id}/software",
        json={"name": "SW", "description": None},
    )
    software_id = sw.json()["id"]
    pr = await client.post(
        f"/software/{software_id}/projects",
        json={"name": "P1", "description": None},
    )
    project_id = pr.json()["id"]

    st_md = await client.post(
        f"/studios/{studio_id}/artifacts/md",
        json={"name": "move-me.md", "content": "# move"},
    )
    assert st_md.status_code == 200
    aid = st_md.json()["id"]

    det1 = await client.get(f"/artifacts/{aid}")
    assert det1.status_code == 200
    body1 = det1.json()
    assert body1["scope_level"] == "studio"
    sid_ctx = body1["context_studio_id"]

    pa = await client.patch(
        f"/artifacts/{aid}/scope",
        json={"scope_level": "software", "software_id": software_id},
    )
    assert pa.status_code == 200, pa.text
    j = pa.json()
    assert j["scope_level"] == "software"
    assert j["context_studio_id"] == sid_ctx
    assert j["context_software_id"] == software_id

    dl = await client.get(f"/artifacts/{aid}/download")
    assert dl.status_code == 200

    pb = await client.patch(
        f"/artifacts/{aid}/scope",
        json={"scope_level": "project", "project_id": project_id},
    )
    assert pb.status_code == 200, pb.text
    jp = pb.json()
    assert jp["scope_level"] == "project"
    assert jp["project_id"] == project_id

    dl2 = await client.get(f"/artifacts/{aid}/download")
    assert dl2.status_code == 200


@pytest.mark.asyncio
async def test_artifact_library_401_without_cookie(
    client: AsyncClient,
) -> None:
    fake = str(uuid.uuid4())
    r = await client.get(f"/studios/{fake}/artifact-library")
    assert r.status_code == 401
