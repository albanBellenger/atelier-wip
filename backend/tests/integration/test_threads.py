"""Private section thread SSE and GET (Slice 6)."""

import json
import uuid
from collections.abc import AsyncIterator

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.exceptions import ApiError
from app.models import User
from app.services.rag_service import RAGContext, RAGService


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


async def _project_section(
    client: AsyncClient, sfx: str
) -> tuple[str, str, str, str, str]:
    """token, studio_id, project_id, section_id, owner_email."""
    token = await _register(client, sfx, "owner")
    email = f"owner-{sfx}@example.com"
    client.cookies.set("atelier_token", token)
    cr = await client.post("/studios", json={"name": f"S{sfx}", "description": "d"})
    assert cr.status_code == 200
    studio_id = cr.json()["id"]
    sw = await client.post(
        f"/studios/{studio_id}/software",
        json={"name": "SW", "description": None, "definition": "Def."},
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
        json={"title": "Intro", "slug": f"sec-{sfx}"},
    )
    assert sec.status_code == 200
    section_id = sec.json()["id"]
    return token, studio_id, project_id, section_id, email


async def _promote_tool_admin(db_session, email: str) -> None:
    r = await db_session.execute(select(User).where(User.email == email))
    u = r.scalar_one()
    u.is_tool_admin = True
    await db_session.commit()


def _last_nonempty_line(text: str) -> str:
    for line in reversed(text.strip().splitlines()):
        s = line.strip()
        if s:
            return s
    return ""


@pytest.mark.asyncio
async def test_stream_sse_envelope_format(
    client: AsyncClient, db_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _sid, pid, section_id, email = await _project_section(client, sfx)
    await _promote_tool_admin(db_session, email)
    client.cookies.set("atelier_token", token)
    await client.put(
        "/admin/config",
        json={
            "llm_provider": "openai",
            "llm_model": "gpt-4o-mini",
            "llm_api_key": "sk-test",
        },
    )

    async def fake_rag(self, *a, **k):
        return RAGContext(text="ctx", truncated=False)

    async def fake_stream(
        self, *a, **k
    ) -> AsyncIterator[str]:
        yield "Hello"
        yield " world"

    async def fake_structured(self, *a, **k):
        return {"conflicts": []}

    monkeypatch.setattr("app.services.rag_service.RAGService.build_context", fake_rag)
    monkeypatch.setattr("app.services.llm_service.LLMService.chat_stream", fake_stream)
    monkeypatch.setattr(
        "app.services.llm_service.LLMService.chat_structured", fake_structured
    )

    r = await client.post(
        f"/projects/{pid}/sections/{section_id}/thread/messages",
        json={"content": "hello"},
    )
    assert r.status_code == 200, r.text
    body = r.text
    parsed = []
    for line in body.splitlines():
        if line.startswith("data: "):
            p = line[6:].strip()
            if p and p != "[DONE]":
                try:
                    parsed.append(json.loads(p))
                except json.JSONDecodeError:
                    pass
    assert any(x.get("type") == "token" and "text" in x for x in parsed)
    meta = [x for x in parsed if x.get("type") == "meta"]
    assert len(meta) == 1
    assert meta[0].get("conflicts") == []
    assert "context_truncated" in meta[0]
    assert meta[0].get("context_truncated") is False
    assert _last_nonempty_line(body) == "data: [DONE]"


@pytest.mark.asyncio
async def test_stream_conflict_meta_populated(
    client: AsyncClient, db_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _sid, pid, section_id, email = await _project_section(client, sfx)
    await _promote_tool_admin(db_session, email)
    client.cookies.set("atelier_token", token)
    await client.put(
        "/admin/config",
        json={
            "llm_provider": "openai",
            "llm_model": "gpt-4o-mini",
            "llm_api_key": "sk-test",
        },
    )

    async def fake_rag(self, *a, **k):
        return RAGContext(text="ctx", truncated=True)

    async def fake_stream(self, *a, **k) -> AsyncIterator[str]:
        yield "x"

    async def fake_structured(self, *a, **k):
        return {
            "conflicts": [
                {"description": "X contradicts Y"},
            ],
        }

    monkeypatch.setattr("app.services.rag_service.RAGService.build_context", fake_rag)
    monkeypatch.setattr("app.services.llm_service.LLMService.chat_stream", fake_stream)
    monkeypatch.setattr(
        "app.services.llm_service.LLMService.chat_structured", fake_structured
    )

    r = await client.post(
        f"/projects/{pid}/sections/{section_id}/thread/messages",
        json={"content": "hello"},
    )
    assert r.status_code == 200, r.text
    meta = None
    for line in r.text.splitlines():
        if line.startswith("data: "):
            p = line[6:].strip()
            if p.startswith("{"):
                j = json.loads(p)
                if j.get("type") == "meta":
                    meta = j
    assert meta is not None
    assert len(meta["conflicts"]) == 1
    assert meta["conflicts"][0]["description"] == "X contradicts Y"


@pytest.mark.asyncio
async def test_viewer_cannot_stream(
    client: AsyncClient, db_session,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, studio_id, pid, section_id, _email = await _project_section(client, sfx)
    vtok = await _register(client, sfx, "viewer")
    client.cookies.set("atelier_token", token)
    await client.post(
        f"/studios/{studio_id}/members",
        json={"email": f"viewer-{sfx}@example.com", "role": "studio_viewer"},
    )
    client.cookies.set("atelier_token", vtok)
    r = await client.post(
        f"/projects/{pid}/sections/{section_id}/thread/messages",
        json={"content": "hi"},
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_unauthenticated_cannot_stream(
    client: AsyncClient,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _sid, pid, section_id, _ = await _project_section(client, sfx)
    client.cookies.clear()
    r = await client.post(
        f"/projects/{pid}/sections/{section_id}/thread/messages",
        json={"content": "hi"},
    )
    assert r.status_code == 401
    # restore for fixture hygiene
    client.cookies.set("atelier_token", token)


@pytest.mark.asyncio
async def test_get_thread_returns_history(
    client: AsyncClient, db_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _sid, pid, section_id, email = await _project_section(client, sfx)
    await _promote_tool_admin(db_session, email)
    client.cookies.set("atelier_token", token)
    await client.put(
        "/admin/config",
        json={
            "llm_provider": "openai",
            "llm_model": "gpt-4o-mini",
            "llm_api_key": "sk-test",
        },
    )

    async def fake_rag(self, *a, **k):
        return RAGContext(text="ctx", truncated=False)

    async def fake_stream(self, *a, **k) -> AsyncIterator[str]:
        yield "ok"

    async def fake_structured(self, *a, **k):
        return {"conflicts": []}

    monkeypatch.setattr("app.services.rag_service.RAGService.build_context", fake_rag)
    monkeypatch.setattr("app.services.llm_service.LLMService.chat_stream", fake_stream)
    monkeypatch.setattr(
        "app.services.llm_service.LLMService.chat_structured", fake_structured
    )

    r = await client.post(
        f"/projects/{pid}/sections/{section_id}/thread/messages",
        json={"content": "user asks"},
    )
    assert r.status_code == 200, r.text

    g = await client.get(
        f"/projects/{pid}/sections/{section_id}/thread",
    )
    assert g.status_code == 200
    msgs = g.json()["messages"]
    roles = [m["role"] for m in msgs]
    assert "user" in roles
    assert "assistant" in roles
    assert any("ok" in m.get("content", "") for m in msgs if m["role"] == "assistant")


@pytest.mark.asyncio
async def test_llm_failure_writes_tombstone_message(
    client: AsyncClient, db_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _sid, pid, section_id, email = await _project_section(client, sfx)
    await _promote_tool_admin(db_session, email)
    client.cookies.set("atelier_token", token)
    await client.put(
        "/admin/config",
        json={
            "llm_provider": "openai",
            "llm_model": "gpt-4o-mini",
            "llm_api_key": "sk-test",
        },
    )

    async def fake_rag(self, *a, **k):
        return RAGContext(text="ctx", truncated=False)

    async def fail_stream(self, *a, **k) -> AsyncIterator[str]:
        raise ApiError(
            status_code=502, code="LLM_ERROR", message="no"
        )
        if False:  # pragma: no cover
            yield "x"

    monkeypatch.setattr("app.services.rag_service.RAGService.build_context", fake_rag)
    monkeypatch.setattr("app.services.llm_service.LLMService.chat_stream", fail_stream)

    r = await client.post(
        f"/projects/{pid}/sections/{section_id}/thread/messages",
        json={"content": "q"},
    )
    assert r.status_code == 200, r.text
    _ = r.text

    g = await client.get(
        f"/projects/{pid}/sections/{section_id}/thread",
    )
    assert g.status_code == 200
    msgs = g.json()["messages"]
    asst = [m for m in msgs if m["role"] == "assistant"]
    assert asst
    assert asst[-1]["content"].startswith("[error:")


@pytest.mark.asyncio
async def test_stream_meta_context_truncated_true_when_budget_tight(
    client: AsyncClient, db_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _sid, pid, section_id, email = await _project_section(client, sfx)
    await _promote_tool_admin(db_session, email)
    client.cookies.set("atelier_token", token)
    await client.put(
        "/admin/config",
        json={
            "llm_provider": "openai",
            "llm_model": "gpt-4o-mini",
            "llm_api_key": "sk-test",
        },
    )
    huge = "C" * 8000
    patch_r = await client.patch(
        f"/projects/{pid}/sections/{section_id}",
        json={"content": huge},
    )
    assert patch_r.status_code == 200

    _orig = RAGService.build_context

    async def low_budget(self, *args, **kwargs):
        kwargs["token_budget"] = 80
        return await _orig(self, *args, **kwargs)

    monkeypatch.setattr("app.services.rag_service.RAGService.build_context", low_budget)

    async def fake_stream(self, *a, **k) -> AsyncIterator[str]:
        yield "ok"

    async def fake_structured(self, *a, **k):
        return {"conflicts": []}

    monkeypatch.setattr("app.services.llm_service.LLMService.chat_stream", fake_stream)
    monkeypatch.setattr(
        "app.services.llm_service.LLMService.chat_structured", fake_structured
    )

    r = await client.post(
        f"/projects/{pid}/sections/{section_id}/thread/messages",
        json={"content": "hello"},
    )
    assert r.status_code == 200, r.text
    meta = None
    for line in r.text.splitlines():
        if line.startswith("data: "):
            p = line[6:].strip()
            if p.startswith("{"):
                j = json.loads(p)
                if j.get("type") == "meta":
                    meta = j
    assert meta is not None
    assert meta.get("context_truncated") is True
