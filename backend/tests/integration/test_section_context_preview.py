"""Slice B: GET /projects/{id}/sections/{id}/context-preview."""

import uuid

import pytest
from httpx import AsyncClient


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


@pytest.mark.asyncio
async def test_context_preview_happy_and_join_matches_rag_text(
    client: AsyncClient,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token = await _register(client, sfx, "owner")
    client.cookies.set("atelier_token", token)
    cr = await client.post("/studios", json={"name": f"S{sfx}", "description": "d"})
    assert cr.status_code == 200
    studio_id = cr.json()["id"]
    sw = await client.post(
        f"/studios/{studio_id}/software",
        json={"name": "SW"},
    )
    assert sw.status_code == 200
    software_id = sw.json()["id"]
    pr = await client.post(
        f"/software/{software_id}/projects",
        json={"name": "P1"},
    )
    assert pr.status_code == 200
    project_id = pr.json()["id"]
    s1 = await client.post(
        f"/projects/{project_id}/sections",
        json={"title": "Intro", "content": "alpha"},
    )
    assert s1.status_code == 200
    sid = s1.json()["id"]

    r = await client.get(
        f"/projects/{project_id}/sections/{sid}/context-preview",
        params={"q": "alpha", "token_budget": 6000},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "blocks" in body
    assert body["budget_tokens"] == 6000
    assert isinstance(body["blocks"], list)
    assert len(body["blocks"]) >= 3
    kinds = [b["kind"] for b in body["blocks"]]
    assert "software_def" in kinds
    assert "outline" in kinds
    assert "current_section" in kinds
    joined = "\n\n".join(b["body"] for b in body["blocks"])
    assert len(joined) > 0
    assert "Intro" in joined or "alpha" in joined


@pytest.mark.asyncio
async def test_context_preview_debug_raw_rag_when_param(
    client: AsyncClient,
) -> None:
    """Non-production: debug_raw_rag=true returns the same text shape as build_context."""
    sfx = uuid.uuid4().hex[:8]
    token = await _register(client, sfx, "owner")
    client.cookies.set("atelier_token", token)
    cr = await client.post("/studios", json={"name": f"S{sfx}", "description": "d"})
    assert cr.status_code == 200
    studio_id = cr.json()["id"]
    sw = await client.post(
        f"/studios/{studio_id}/software",
        json={"name": "SW"},
    )
    assert sw.status_code == 200
    software_id = sw.json()["id"]
    pr = await client.post(
        f"/software/{software_id}/projects",
        json={"name": "P1"},
    )
    assert pr.status_code == 200
    project_id = pr.json()["id"]
    s1 = await client.post(
        f"/projects/{project_id}/sections",
        json={"title": "Intro", "content": "alpha"},
    )
    assert s1.status_code == 200
    sid = s1.json()["id"]

    r = await client.get(
        f"/projects/{project_id}/sections/{sid}/context-preview",
        params={"q": "alpha", "debug_raw_rag": "true"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    raw = body.get("debug_raw_rag_text")
    assert raw is not None
    assert isinstance(raw, str)
    assert len(raw) > 0
    assert "## Software definition" in raw
    assert "## Project outline" in raw
    assert "## Current section" in raw
async def test_context_preview_401_without_auth(client: AsyncClient) -> None:
    r = await client.get(
        "/projects/00000000-0000-4000-8000-000000000001/"
        "sections/00000000-0000-4000-8000-000000000002/context-preview",
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_context_preview_404_unknown_section(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    token = await _register(client, sfx, "owner")
    client.cookies.set("atelier_token", token)
    cr = await client.post("/studios", json={"name": f"S{sfx}", "description": "d"})
    assert cr.status_code == 200
    studio_id = cr.json()["id"]
    sw = await client.post(
        f"/studios/{studio_id}/software",
        json={"name": "SW"},
    )
    assert sw.status_code == 200
    software_id = sw.json()["id"]
    pr = await client.post(
        f"/software/{software_id}/projects",
        json={"name": "P1"},
    )
    assert pr.status_code == 200
    project_id = pr.json()["id"]
    bad_sid = "00000000-0000-4000-8000-000000000099"
    r = await client.get(
        f"/projects/{project_id}/sections/{bad_sid}/context-preview",
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_context_preview_422_token_budget(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    token = await _register(client, sfx, "owner")
    client.cookies.set("atelier_token", token)
    cr = await client.post("/studios", json={"name": f"S{sfx}", "description": "d"})
    assert cr.status_code == 200
    studio_id = cr.json()["id"]
    sw = await client.post(
        f"/studios/{studio_id}/software",
        json={"name": "SW"},
    )
    assert sw.status_code == 200
    software_id = sw.json()["id"]
    pr = await client.post(
        f"/software/{software_id}/projects",
        json={"name": "P1"},
    )
    assert pr.status_code == 200
    project_id = pr.json()["id"]
    s1 = await client.post(
        f"/projects/{project_id}/sections",
        json={"title": "Intro"},
    )
    assert s1.status_code == 200
    sid = s1.json()["id"]
    r = await client.get(
        f"/projects/{project_id}/sections/{sid}/context-preview",
        params={"token_budget": 50},
    )
    assert r.status_code == 422
