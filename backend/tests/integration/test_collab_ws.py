"""Slice 4: collaborative section WebSocket (Yjs / pycrdt-websocket)."""

import uuid

import pytest
from fastapi.testclient import TestClient
from httpx import AsyncClient

from app.collab.server import collab_room_path, parse_collab_path
from app.main import app


def test_collab_path_parse_roundtrip() -> None:
    a, b = uuid.uuid4(), uuid.uuid4()
    p = collab_room_path(a, b)
    assert parse_collab_path(p) == (a, b)


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


async def _studio_project_section(
    client: AsyncClient, sfx: str
) -> tuple[str, str, str, str, str]:
    """Returns (token, studio_id, software_id, project_id, section_id)."""
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
    sec = await client.post(
        f"/projects/{project_id}/sections",
        json={"title": "Intro", "slug": None},
    )
    assert sec.status_code == 200
    section_id = sec.json()["id"]
    return token, studio_id, software_id, project_id, section_id


@pytest.mark.asyncio
async def test_collab_websocket_requires_auth(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    _, _, _, project_id, section_id = await _studio_project_section(client, sfx)

    with TestClient(app) as tc:
        with pytest.raises(Exception):
            with tc.websocket_connect(
                f"/ws/projects/{project_id}/sections/{section_id}/collab",
            ):
                pass


@pytest.mark.asyncio
async def test_collab_websocket_rejects_non_studio_member(
    client: AsyncClient,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    _token_owner, _studio_id, _sw, project_id, section_id = await _studio_project_section(
        client, sfx
    )
    outsider_tok = await _register(client, sfx, "outsider")

    with TestClient(app) as tc:
        with pytest.raises(Exception):
            with tc.websocket_connect(
                f"/ws/projects/{project_id}/sections/{section_id}/collab"
                f"?token={outsider_tok}",
            ):
                pass
