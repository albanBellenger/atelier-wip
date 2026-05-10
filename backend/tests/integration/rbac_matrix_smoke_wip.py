"""Smoke tests for the RBAC matrix in docs/rbac-module-matrix.md (home studio roles).

Cross-studio grants are covered in test_cross_studio_access.py.
"""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from tests.integration.studio_http_seed import post_admin_studio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.security.jwt import create_access_token
from tests.factories import create_user


@pytest.fixture(autouse=True)
def _fake_embedding_rbac(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services.embedding_service import EmbeddingService, OPENAI_EMBEDDING_API_BASE

    async def ready(_self: object) -> tuple[str, str, str, str]:
        return ("text-embedding-3-small", "sk-fake", "openai", OPENAI_EMBEDDING_API_BASE)

    async def batch(_self: object, texts: list[str], *, usage_scope: object | None = None) -> list[list[float]]:
        return [[0.0] * 1536 for _ in texts]

    monkeypatch.setattr(EmbeddingService, "require_embedding_ready", ready)
    monkeypatch.setattr(EmbeddingService, "embed_batch", batch)


@pytest.fixture(autouse=True)
def _noop_embed_tasks_rbac(monkeypatch: pytest.MonkeyPatch) -> None:
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


@pytest.fixture(autouse=True)
def _in_memory_minio_rbac(monkeypatch: pytest.MonkeyPatch) -> None:
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


async def _register(client: AsyncClient, sfx: str, label: str) -> str:
    r = await client.post(
        "/auth/register",
        json={
            "email": f"{label}-{sfx}@example.com",
            "password": "securepass123",
            "display_name": label,
        },
    )
    assert r.status_code == 200, r.text
    token = r.cookies.get("atelier_token")
    assert token
    return token


async def _home_studio_graph(
    client: AsyncClient, sfx: str
) -> dict[str, Any]:
    """Owner + builder + home viewer; one software, project, two sections."""
    t_owner = await _register(client, sfx, "rbacowner")
    t_builder = await _register(client, sfx, "rbacbuilder")
    t_viewer = await _register(client, sfx, "rbacviewer")

    client.cookies.set("atelier_token", t_owner)
    studio_id = (
        await post_admin_studio(client, db_session, user_email=f"rbacviewer-{sfx}@example.com", json_body={"name": f"RBAC{sfx}", "description": ""})
    ).json()["id"]

    inv_b = await client.post(
        f"/studios/{studio_id}/members",
        json={"email": f"rbacbuilder-{sfx}@example.com", "role": "studio_member"},
    )
    assert inv_b.status_code == 200
    inv_v = await client.post(
        f"/studios/{studio_id}/members",
        json={"email": f"rbacviewer-{sfx}@example.com", "role": "studio_viewer"},
    )
    assert inv_v.status_code == 200

    sw_id = (
        await client.post(
            f"/studios/{studio_id}/software",
            json={"name": f"SW{sfx}", "description": ""},
        )
    ).json()["id"]

    proj_id = (
        await client.post(
            f"/software/{sw_id}/projects",
            json={"name": f"PR{sfx}", "description": ""},
        )
    ).json()["id"]

    sec1 = (
        await client.post(
            f"/projects/{proj_id}/sections",
            json={"title": "First"},
        )
    ).json()["id"]
    sec2 = (
        await client.post(
            f"/projects/{proj_id}/sections",
            json={"title": "Second"},
        )
    ).json()["id"]

    return {
        "studio_id": studio_id,
        "sw_id": sw_id,
        "proj_id": proj_id,
        "sec1": sec1,
        "sec2": sec2,
        "t_owner": t_owner,
        "t_builder": t_builder,
        "t_viewer": t_viewer,
    }


@pytest.mark.asyncio
async def test_tool_admin_only_embedding_library(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Tool admin gate does not depend on registration ordering."""
    admin = await create_user(db_session, is_platform_admin=True)
    member = await create_user(
        db_session,
        email="rbac-member-tool@example.com",
        is_platform_admin=False,
    )
    await db_session.flush()

    client.cookies.set("atelier_token", create_access_token(admin.id))
    ok = await client.get("/admin/embeddings/library")
    assert ok.status_code == 200

    client.cookies.set("atelier_token", create_access_token(member.id))
    denied = await client.get("/admin/embeddings/library")
    assert denied.status_code == 403


@pytest.mark.asyncio
async def test_rbac_home_studio_matrix(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    g = await _home_studio_graph(client, sfx)
    sid, sw, pid, s1, s2 = (
        g["studio_id"],
        g["sw_id"],
        g["proj_id"],
        g["sec1"],
        g["sec2"],
    )
    tokens = {
        "owner": g["t_owner"],
        "builder": g["t_builder"],
        "viewer": g["t_viewer"],
    }

    async def req(
        role: str,
        method: str,
        path: str,
        *,
        json_body: dict[str, Any] | None = None,
    ) -> int:
        client.cookies.set("atelier_token", tokens[role])
        m = method.upper()
        if m == "GET":
            r = await client.get(path)
        elif m == "POST":
            r = await client.post(path, json=json_body or {})
        elif m == "PATCH":
            r = await client.patch(path, json=json_body or {})
        elif m == "PUT":
            r = await client.put(path, json=json_body or {})
        elif m == "DELETE":
            r = await client.delete(path)
        else:
            raise AssertionError(method)
        return r.status_code

    # --- Studios ---
    assert await req("viewer", "PATCH", f"/studios/{sid}", json_body={"name": "x"}) == 403
    assert await req("builder", "PATCH", f"/studios/{sid}", json_body={"name": "x"}) == 403
    assert await req("owner", "PATCH", f"/studios/{sid}", json_body={"name": f"RBAC{sfx}b"}) == 200

    # --- Software: create / delete / definition ---
    assert await req("builder", "POST", f"/studios/{sid}/software", json_body={"name": "nope"}) == 403
    assert (
        await req(
            "builder",
            "PATCH",
            f"/studios/{sid}/software/{sw}",
            json_body={"definition": "only-admin"},
        )
        == 403
    )
    assert (
        await req(
            "owner",
            "PATCH",
            f"/studios/{sid}/software/{sw}",
            json_body={"definition": "admin-ok"},
        )
        == 200
    )

    # --- Projects: create / update ---
    assert (
        await req(
            "viewer",
            "POST",
            f"/software/{sw}/projects",
            json_body={"name": "blocked"},
        )
        == 403
    )
    assert (
        await req(
            "builder",
            "POST",
            f"/software/{sw}/projects",
            json_body={"name": f"Extra{sfx}", "description": ""},
        )
        == 200
    )
    client.cookies.set("atelier_token", tokens["builder"])
    extra_pid = (
        await client.post(
            f"/software/{sw}/projects",
            json={"name": f"Extra2{sfx}", "description": ""},
        )
    ).json()["id"]
    put_res = await client.put(
        f"/software/{sw}/projects/{extra_pid}",
        json={"name": "nope", "description": ""},
    )
    assert put_res.status_code == 403

    # --- Sections: outline vs content ---
    assert (
        await req(
            "builder",
            "POST",
            f"/projects/{pid}/sections",
            json_body={"title": "OutlineBlocked"},
        )
        == 403
    )
    assert await req("viewer", "PATCH", f"/projects/{pid}/sections/{s1}", json_body={"content": "v"}) == 403
    assert (
        await req(
            "builder", "PATCH", f"/projects/{pid}/sections/{s1}", json_body={"content": "from-builder"}
        )
        == 200
    )

    # --- Work orders ---
    assert await req("viewer", "GET", f"/projects/{pid}/work-orders") == 200
    assert (
        await req(
            "viewer",
            "POST",
            f"/projects/{pid}/work-orders",
            json_body={
                "title": "wo",
                "description": "d",
                "implementation_guide": "g",
                "acceptance_criteria": "a",
            },
        )
        == 403
    )
    assert (
        await req(
            "builder",
            "POST",
            f"/projects/{pid}/work-orders",
            json_body={
                "title": "wo",
                "description": "d",
                "implementation_guide": "g",
                "acceptance_criteria": "a",
            },
        )
        == 200
    )

    # --- Issues list (viewer may see empty filtered set) ---
    assert await req("viewer", "GET", f"/projects/{pid}/issues") == 200

    # --- Graph read vs analyze ---
    assert await req("viewer", "GET", f"/projects/{pid}/graph") == 200
    assert await req("viewer", "POST", f"/projects/{pid}/graph/analyze-sections", json_body={}) == 403

    # --- Publish (RBAC: viewers forbidden; editors fail later without git) ---
    assert await req("viewer", "POST", f"/projects/{pid}/publish", json_body={}) == 403
    client.cookies.set("atelier_token", tokens["builder"])
    pub_b = await client.post(f"/projects/{pid}/publish", json={})
    assert pub_b.status_code != 403
    client.cookies.set("atelier_token", tokens["owner"])
    pub_o = await client.post(f"/projects/{pid}/publish", json={})
    assert pub_o.status_code != 403

    # --- Artifacts list vs upload ---
    assert await req("viewer", "GET", f"/projects/{pid}/artifacts") == 200
    client.cookies.set("atelier_token", tokens["viewer"])
    r_v_art = await client.post(
        f"/projects/{pid}/artifacts",
        files={"file": ("v.md", b"# V\n", "text/markdown")},
    )
    assert r_v_art.status_code == 403
    client.cookies.set("atelier_token", tokens["builder"])
    r_b_art = await client.post(
        f"/projects/{pid}/artifacts",
        files={"file": ("b.md", b"# B\n", "text/markdown")},
    )
    assert r_b_art.status_code == 200

    # --- Private thread (requires editor) ---
    assert await req("viewer", "GET", f"/projects/{pid}/sections/{s1}/thread") == 403
    assert await req("builder", "GET", f"/projects/{pid}/sections/{s1}/thread") == 200

    # --- Project chat history ---
    assert await req("viewer", "GET", f"/projects/{pid}/chat") == 403
    assert await req("builder", "GET", f"/projects/{pid}/chat") == 200

    # --- Project chat RAG preview ---
    assert await req("viewer", "GET", f"/projects/{pid}/chat/rag-preview") == 403
    assert await req("builder", "GET", f"/projects/{pid}/chat/rag-preview") == 200

    # --- Section improve ---
    assert (
        await req(
            "viewer",
            "POST",
            f"/projects/{pid}/sections/{s2}/improve",
            json_body={
                "instruction": "x",
                "current_section_plaintext": "y",
            },
        )
        == 403
    )

    # --- Outline delete: use second section (avoid deleting sole section if app forbids) ---
    assert await req("builder", "DELETE", f"/projects/{pid}/sections/{s2}") == 403
    assert await req("owner", "DELETE", f"/projects/{pid}/sections/{s2}") == 204


@pytest.mark.parametrize(
    ("role", "expect_forbidden"),
    [
        ("owner", False),
        ("builder", True),
    ],
)
@pytest.mark.asyncio
async def test_rbac_studio_token_usage_admin_only(
    client: AsyncClient, role: str, expect_forbidden: bool
) -> None:
    sfx = uuid.uuid4().hex[:8]
    g = await _home_studio_graph(client, sfx)
    sid = g["studio_id"]
    token = g["t_owner"] if role == "owner" else g["t_builder"]
    client.cookies.set("atelier_token", token)
    r = await client.get(f"/studios/{sid}/token-usage")
    if expect_forbidden:
        assert r.status_code == 403
    else:
        assert r.status_code == 200
