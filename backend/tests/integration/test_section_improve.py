"""POST /projects/{id}/sections/{id}/improve (Slice D)."""

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
async def test_section_improve_returns_markdown(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token = await _register(client, sfx, "owner")
    client.cookies.set("atelier_token", token)
    cr = await client.post("/studios", json={"name": f"S{sfx}", "description": "d"})
    assert cr.status_code == 200
    studio_id = cr.json()["id"]
    sw = await client.post(
        f"/studios/{studio_id}/software",
        json={"name": "SW", "definition": "Spec tool"},
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
        json={"title": "Intro", "content": "# Hello\n"},
    )
    assert s1.status_code == 200
    sid = s1.json()["id"]

    async def fake_ready(self) -> None:
        return None

    async def fake_improve(self, *a, **k):
        return "# Hello\n\nRevised."

    monkeypatch.setattr(
        "app.services.llm_service.LLMService.ensure_openai_llm_ready",
        fake_ready,
    )
    monkeypatch.setattr(
        "app.services.section_service.SectionService.improve_section_markdown",
        fake_improve,
    )

    r = await client.post(
        f"/projects/{project_id}/sections/{sid}/improve",
        json={"instruction": "tighten"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["improved_markdown"] == "# Hello\n\nRevised."


@pytest.mark.asyncio
async def test_section_improve_401(client: AsyncClient) -> None:
    r = await client.post(
        "/projects/00000000-0000-4000-8000-000000000001/"
        "sections/00000000-0000-4000-8000-000000000002/improve",
        json={},
    )
    assert r.status_code == 401
