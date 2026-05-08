"""Artifact scope fields on software list + software/project exclusion PATCH."""

from __future__ import annotations

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
        return ("text-embedding-3-small", "sk-fake", "openai", OPENAI_EMBEDDING_API_BASE)

    async def batch(_self: object, texts: list[str], *, usage_scope: object | None = None) -> list[list[float]]:
        return [[0.0] * 1536 for _ in texts]

    from app.services.embedding_service import EmbeddingService

    monkeypatch.setattr(EmbeddingService, "require_embedding_ready", ready)
    monkeypatch.setattr(EmbeddingService, "embed_batch", batch)


async def _promote_tool_admin(db_session, email: str) -> None:
    r = await db_session.execute(select(User).where(User.email == email))
    u = r.scalar_one()
    u.is_platform_admin = True
    await db_session.flush()


async def _studio_two_projects_one_artifact_each(
    client: AsyncClient, db_session, sfx: str
) -> tuple[str, str, str, str, str, str]:
    token = await _register(client, sfx, "owner")
    await _promote_tool_admin(db_session, f"owner-{sfx}@example.com")
    client.cookies.set("atelier_token", token)
    put_cfg = await client.put(
        "/admin/embedding-config",
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
    aid1 = up1.json()["id"]
    up2 = await client.post(
        f"/projects/{pid2}/artifacts/md",
        json={"name": "Doc B", "content": "# b"},
    )
    assert up2.status_code == 200
    aid2 = up2.json()["id"]
    return token, studio_id, software_id, pid1, pid2, aid1, aid2


@pytest.mark.asyncio
async def test_software_artifacts_list_includes_scope_and_exclusion_nulls(
    client: AsyncClient,
    db_session,
    fake_embed: None,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    _, _, software_id, pid1, pid2, _, _ = await _studio_two_projects_one_artifact_each(
        client, db_session, sfx
    )

    listed = await client.get(f"/software/{software_id}/artifacts")
    assert listed.status_code == 200
    body = listed.json()
    assert len(body) == 2
    for row in body:
        assert row["scope_level"] == "project"
        assert row["excluded_at_software"] is None
        assert row["excluded_at_project"] is None
    assert {row["project_id"] for row in body} == {pid1, pid2}


@pytest.mark.asyncio
async def test_patch_software_artifact_exclusion_requires_auth(
    client: AsyncClient,
    db_session,
    fake_embed: None,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    _, studio_id, software_id, _, _, aid1, _ = await _studio_two_projects_one_artifact_each(
        client, db_session, sfx
    )
    client.cookies.clear()
    r = await client.patch(
        f"/studios/{studio_id}/software/{software_id}/artifact-exclusions",
        json={"artifact_id": aid1, "excluded": True},
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_patch_software_artifact_exclusion_outsider_forbidden(
    client: AsyncClient,
    db_session,
    fake_embed: None,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    _, studio_id, software_id, _, _, aid1, _ = await _studio_two_projects_one_artifact_each(
        client, db_session, sfx
    )
    outsider = await _register(client, sfx, "out")
    client.cookies.set("atelier_token", outsider)
    r = await client.patch(
        f"/studios/{studio_id}/software/{software_id}/artifact-exclusions",
        json={"artifact_id": aid1, "excluded": True},
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_patch_software_artifact_exclusion_wrong_studio_404(
    client: AsyncClient,
    db_session,
    fake_embed: None,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, studio_id, software_id, _, _, aid1, _ = await _studio_two_projects_one_artifact_each(
        client, db_session, sfx
    )
    bad_studio = uuid.uuid4()
    client.cookies.set("atelier_token", token)
    r = await client.patch(
        f"/studios/{bad_studio}/software/{software_id}/artifact-exclusions",
        json={"artifact_id": aid1, "excluded": True},
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_patch_software_artifact_exclusion_foreign_artifact_404(
    client: AsyncClient,
    db_session,
    fake_embed: None,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, studio_id, software_id, _, _, _, _ = await _studio_two_projects_one_artifact_each(
        client, db_session, sfx
    )
    other_sfx = uuid.uuid4().hex[:8]
    token2 = await _register(client, other_sfx, "other")
    client.cookies.set("atelier_token", token2)
    cr2 = await client.post("/studios", json={"name": f"O{other_sfx}", "description": "d"})
    assert cr2.status_code == 200
    st2 = cr2.json()["id"]
    sw2 = await client.post(
        f"/studios/{st2}/software",
        json={"name": "OtherSW", "description": None},
    )
    assert sw2.status_code == 200
    swid2 = sw2.json()["id"]
    pz = await client.post(
        f"/software/{swid2}/projects",
        json={"name": "Z", "description": None},
    )
    assert pz.status_code == 200
    pzid = pz.json()["id"]
    upz = await client.post(
        f"/projects/{pzid}/artifacts/md",
        json={"name": "Zdoc", "content": "# z"},
    )
    assert upz.status_code == 200
    foreign_aid = upz.json()["id"]

    client.cookies.set("atelier_token", token)
    r = await client.patch(
        f"/studios/{studio_id}/software/{software_id}/artifact-exclusions",
        json={"artifact_id": str(foreign_aid), "excluded": True},
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_patch_software_artifact_exclusion_happy_then_list_shows_timestamp(
    client: AsyncClient,
    db_session,
    fake_embed: None,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, studio_id, software_id, _, _, aid1, _ = await _studio_two_projects_one_artifact_each(
        client, db_session, sfx
    )
    client.cookies.set("atelier_token", token)
    r = await client.patch(
        f"/studios/{studio_id}/software/{software_id}/artifact-exclusions",
        json={"artifact_id": aid1, "excluded": True},
    )
    assert r.status_code == 200, r.text
    assert r.json()["excluded"] is True

    listed = await client.get(f"/software/{software_id}/artifacts")
    assert listed.status_code == 200
    rows = {row["id"]: row for row in listed.json()}
    assert rows[aid1]["excluded_at_software"] is not None
    assert rows[aid1]["excluded_at_project"] is None

    r2 = await client.patch(
        f"/studios/{studio_id}/software/{software_id}/artifact-exclusions",
        json={"artifact_id": aid1, "excluded": False},
    )
    assert r2.status_code == 200
    assert r2.json()["excluded"] is False

    listed2 = await client.get(f"/software/{software_id}/artifacts")
    assert listed2.json()[0]["excluded_at_software"] is None or all(
        row["excluded_at_software"] is None for row in listed2.json() if row["id"] == aid1
    )
    for row in listed2.json():
        if row["id"] == aid1:
            assert row["excluded_at_software"] is None


@pytest.mark.asyncio
async def test_patch_project_artifact_exclusion_viewer_forbidden(
    client: AsyncClient,
    db_session,
    fake_embed: None,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, studio_id, software_id, pid1, _, aid1, _ = await _studio_two_projects_one_artifact_each(
        client, db_session, sfx
    )
    vtok = await _register(client, sfx, "viewer")
    client.cookies.set("atelier_token", token)
    vr = await client.post(
        f"/studios/{studio_id}/members",
        json={
            "email": f"viewer-{sfx}@example.com",
            "display_name": "Viewer",
            "role": "studio_viewer",
        },
    )
    assert vr.status_code == 200
    client.cookies.set("atelier_token", vtok)
    r = await client.patch(
        f"/studios/{studio_id}/software/{software_id}/projects/{pid1}/artifact-exclusions",
        json={"artifact_id": aid1, "excluded": True},
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_patch_project_exclusion_own_project_artifact(
    client: AsyncClient,
    db_session,
    fake_embed: None,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, studio_id, software_id, pid1, _, aid1, _ = await _studio_two_projects_one_artifact_each(
        client, db_session, sfx
    )
    client.cookies.set("atelier_token", token)
    r = await client.patch(
        f"/studios/{studio_id}/software/{software_id}/projects/{pid1}/artifact-exclusions",
        json={"artifact_id": aid1, "excluded": True},
    )
    assert r.status_code == 200, r.text

    listed = await client.get(f"/software/{software_id}/artifacts")
    row = next(x for x in listed.json() if x["id"] == aid1)
    assert row["excluded_at_project"] is not None
    assert row["excluded_at_software"] is None


@pytest.mark.asyncio
async def test_software_artifacts_for_project_id_shows_sibling_project_exclusion(
    client: AsyncClient,
    db_session,
    fake_embed: None,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, studio_id, software_id, pid1, pid2, _, aid2 = (
        await _studio_two_projects_one_artifact_each(client, db_session, sfx)
    )
    client.cookies.set("atelier_token", token)
    r = await client.patch(
        f"/studios/{studio_id}/software/{software_id}/projects/{pid1}/artifact-exclusions",
        json={"artifact_id": aid2, "excluded": True},
    )
    assert r.status_code == 200, r.text

    listed_default = await client.get(f"/software/{software_id}/artifacts")
    row_beta = next(x for x in listed_default.json() if x["id"] == aid2)
    assert row_beta["excluded_at_project"] is None

    listed_ctx = await client.get(
        f"/software/{software_id}/artifacts",
        params={"for_project_id": pid1},
    )
    row_ctx = next(x for x in listed_ctx.json() if x["id"] == aid2)
    assert row_ctx["excluded_at_project"] is not None


@pytest.mark.asyncio
async def test_patch_invalid_body_422(
    client: AsyncClient,
    db_session,
    fake_embed: None,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, studio_id, software_id, _, _, aid1, _ = await _studio_two_projects_one_artifact_each(
        client, db_session, sfx
    )
    client.cookies.set("atelier_token", token)
    r = await client.patch(
        f"/studios/{studio_id}/software/{software_id}/artifact-exclusions",
        json={"artifact_id": aid1},
    )
    assert r.status_code == 422
