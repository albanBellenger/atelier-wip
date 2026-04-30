"""MCP API key + work-order pull (Slice 12)."""

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from tests.integration.test_work_orders import _studio_project_with_sections


@pytest.mark.asyncio
async def test_mcp_invalid_key_401(client: AsyncClient) -> None:
    r = await client.get(
        "/mcp/v1/work-orders",
        headers={"X-API-Key": "wrong"},
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_mcp_key_list_pull_patch_flow(client: AsyncClient) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, sid, _sw, pid, sec_a, _b = await _studio_project_with_sections(
        client, sfx
    )

    client.cookies.set("atelier_token", token)
    mk = await client.post(
        f"/studios/{sid}/mcp-keys",
        json={"label": "dev", "access_level": "editor"},
    )
    assert mk.status_code == 200
    secret = mk.json()["secret"]

    wo = await client.post(
        f"/projects/{pid}/work-orders",
        json={
            "title": "Task",
            "description": "Desc",
            "status": "backlog",
            "section_ids": [sec_a],
        },
    )
    assert wo.status_code == 200
    wid = wo.json()["id"]

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        bad = await ac.get("/mcp/v1/work-orders")
        assert bad.status_code == 401

        lst = await ac.get(
            "/mcp/v1/work-orders",
            headers={"Authorization": f"Bearer {secret}"},
        )
        assert lst.status_code == 200
        ids = [x["id"] for x in lst.json().get("work_orders", [])]
        assert wid in ids

        pull = await ac.get(
            f"/mcp/v1/work-orders/{wid}",
            headers={"Authorization": f"Bearer {secret}"},
        )
        assert pull.status_code == 200
        body = pull.json()
        assert body["title"] == "Task"
        assert "linked_sections" in body

        patch = await ac.patch(
            f"/mcp/v1/work-orders/{wid}",
            headers={"Authorization": f"Bearer {secret}"},
            json={"status": "in_progress"},
        )
        assert patch.status_code == 200

        viewer_mk = await client.post(
            f"/studios/{sid}/mcp-keys",
            json={"label": "read", "access_level": "viewer"},
        )
        assert viewer_mk.status_code == 200
        vsecret = viewer_mk.json()["secret"]

        forbidden = await ac.patch(
            f"/mcp/v1/work-orders/{wid}",
            headers={"Authorization": f"Bearer {vsecret}"},
            json={"status": "backlog"},
        )
        assert forbidden.status_code == 403
