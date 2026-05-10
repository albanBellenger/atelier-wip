"""GET /projects/{id}/chat/rag-preview — same RAG assembly as project chat."""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.integration.test_work_orders import _studio_project_with_sections


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
async def test_project_chat_rag_preview_happy_no_current_section_block(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _sid, _sw, pid, _a, _b = await _studio_project_with_sections(client, db_session, sfx)
    client.cookies.set("atelier_token", token)
    r = await client.get(
        f"/projects/{pid}/chat/rag-preview",
        params={"q": "Alpha", "token_budget": 6000},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["budget_tokens"] == 6000
    kinds = [b["kind"] for b in body["blocks"]]
    assert "software_def" in kinds
    assert "outline" in kinds
    assert "current_section" not in kinds


@pytest.mark.asyncio
async def test_project_chat_rag_preview_401_without_auth(client: AsyncClient, db_session: AsyncSession) -> None:
    fake_pid = "00000000-0000-4000-8000-000000000001"
    r = await client.get(f"/projects/{fake_pid}/chat/rag-preview")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_project_chat_rag_preview_403_viewer(client: AsyncClient, db_session: AsyncSession) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, studio_id, _sw, pid, _a, _b = await _studio_project_with_sections(
        client, db_session, sfx
    )
    viewer_tok = await _register(client, sfx, "viewer")
    client.cookies.set("atelier_token", token)
    inv = await client.post(
        f"/studios/{studio_id}/members",
        json={"email": f"viewer-{sfx}@example.com", "role": "studio_viewer"},
    )
    assert inv.status_code == 200, inv.text
    client.cookies.set("atelier_token", viewer_tok)
    r = await client.get(f"/projects/{pid}/chat/rag-preview")
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_project_chat_rag_preview_403_outsider_not_studio_member(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _sid, _sw, pid, _a, _b = await _studio_project_with_sections(client, db_session, sfx)
    del token
    outsider = await _register(client, sfx, "outsider")
    client.cookies.set("atelier_token", outsider)
    r = await client.get(f"/projects/{pid}/chat/rag-preview")
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_project_chat_rag_preview_404_unknown_project(client: AsyncClient, db_session: AsyncSession) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _sid, _sw, _pid, _a, _b = await _studio_project_with_sections(client, db_session, sfx)
    client.cookies.set("atelier_token", token)
    bad = "00000000-0000-4000-8000-000000000099"
    r = await client.get(f"/projects/{bad}/chat/rag-preview")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_project_chat_rag_preview_422_token_budget(client: AsyncClient, db_session: AsyncSession) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _sid, _sw, pid, _a, _b = await _studio_project_with_sections(client, db_session, sfx)
    client.cookies.set("atelier_token", token)
    r = await client.get(
        f"/projects/{pid}/chat/rag-preview",
        params={"token_budget": 50},
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_project_chat_rag_preview_cross_studio_other_studio_member_forbidden(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    sfx_a = uuid.uuid4().hex[:8]
    tok_a, _s_a, _sw_a, pid_a, _a, _b = await _studio_project_with_sections(
        client, db_session, sfx_a
    )
    sfx_b = uuid.uuid4().hex[:8]
    tok_b, _s_b, _sw_b, _pid_b, _c, _d = await _studio_project_with_sections(
        client, db_session, sfx_b
    )
    _ = (_sw_b, _pid_b, _c, _d, tok_a)
    client.cookies.set("atelier_token", tok_b)
    r = await client.get(f"/projects/{pid_a}/chat/rag-preview")
    assert r.status_code == 403
