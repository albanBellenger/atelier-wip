"""Private section thread SSE and GET (Slice 6)."""

import json
import uuid
from collections.abc import AsyncIterator
from unittest.mock import MagicMock

import pytest
from httpx import AsyncClient
from sqlalchemy import select, update

from app.exceptions import ApiError
from app.models import (
    LlmProviderRegistry,
    LlmRoutingRule,
    StudioLlmProviderPolicy,
    User,
)
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
    u.is_platform_admin = True
    await db_session.flush()


async def _ensure_openai_registry_connected(db_session) -> None:
    """Tests assume a connected registry row; PUT no longer elevates status without Test."""
    await db_session.execute(
        update(LlmProviderRegistry)
        .where(LlmProviderRegistry.provider_id == "openai")
        .values(status="connected")
    )
    await db_session.flush()


def _last_nonempty_line(text: str) -> str:
    for line in reversed(text.strip().splitlines()):
        s = line.strip()
        if s:
            return s
    return ""


@pytest.fixture(autouse=True)
def _mock_llm_registry_litellm_hydration(monkeypatch: pytest.MonkeyPatch) -> None:
    """Avoid outbound LiteLLM catalog + probe when tests seed ``/admin/llm/providers``."""
    monkeypatch.setattr(
        "app.services.llm_connectivity_service.enrich_model_entries_from_litellm",
        lambda entries, draft_registry_row: list(entries),
    )

    async def _probe_ok(self: object, **_kwargs: object):
        from app.schemas.auth import AdminConnectivityResult

        return AdminConnectivityResult(ok=True, message="ok", detail=None)

    monkeypatch.setattr(
        "app.services.llm_connectivity_service.LLMService.admin_connectivity_probe",
        _probe_ok,
    )


@pytest.mark.asyncio
async def test_stream_sse_envelope_format(
    client: AsyncClient, db_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _sid, pid, section_id, email = await _project_section(client, sfx)
    await _promote_tool_admin(db_session, email)
    client.cookies.set("atelier_token", token)
    await client.put(
        "/admin/llm/providers/openai",
        json={
            "models": ["gpt-4o-mini"],
            "is_default": True,
            "sort_order": 0,
            "llm_api_key": "sk-test",
        },
    )
    await _ensure_openai_registry_connected(db_session)

    async def fake_rag(self, *a, **k):
        return RAGContext(text="ctx", truncated=False)

    async def fake_stream(
        self, *a, **k
    ) -> AsyncIterator[str]:
        yield "Hello"
        yield " world"

    async def fake_structured(self, *a, **k):
        return {"findings": []}

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
    assert meta[0].get("findings") == []
    assert "context_truncated" in meta[0]
    assert meta[0].get("context_truncated") is False
    assert meta[0].get("patch_proposal") is None
    assert _last_nonempty_line(body) == "data: [DONE]"


@pytest.mark.asyncio
async def test_stream_meta_includes_llm_outbound_when_log_prompts(
    client: AsyncClient, db_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _sid, pid, section_id, email = await _project_section(client, sfx)
    await _promote_tool_admin(db_session, email)
    client.cookies.set("atelier_token", token)
    await client.put(
        "/admin/llm/providers/openai",
        json={
            "models": ["gpt-4o-mini"],
            "is_default": True,
            "sort_order": 0,
            "llm_api_key": "sk-test",
        },
    )
    await _ensure_openai_registry_connected(db_session)

    async def fake_rag(self, *a, **k):
        return RAGContext(text="ctx", truncated=False)

    async def fake_stream(
        self, *a, **k
    ) -> AsyncIterator[str]:
        yield "Hello"
        yield " world"

    async def fake_structured(self, *a, **k):
        return {"findings": []}

    monkeypatch.setattr("app.services.rag_service.RAGService.build_context", fake_rag)
    monkeypatch.setattr("app.services.llm_service.LLMService.chat_stream", fake_stream)
    monkeypatch.setattr(
        "app.services.llm_service.LLMService.chat_structured", fake_structured
    )
    monkeypatch.setattr(
        "app.services.private_thread_service.get_settings",
        lambda: MagicMock(log_llm_prompts=True),
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
    meta = [x for x in parsed if x.get("type") == "meta"]
    assert len(meta) == 1
    m0 = meta[0]
    assert isinstance(m0.get("assistant_message_id"), str)
    assert uuid.UUID(m0["assistant_message_id"])
    outbound = m0.get("llm_outbound_messages")
    assert isinstance(outbound, list)
    roles = [x.get("role") for x in outbound]
    assert "system" in roles
    assert "user" in roles
    for row in outbound:
        assert "tokens" in row
        assert isinstance(row["tokens"], int)


@pytest.mark.asyncio
async def test_stream_llm_failure_persists_error_and_completes_sse(
    client: AsyncClient, db_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _sid, pid, section_id, email = await _project_section(client, sfx)
    await _promote_tool_admin(db_session, email)
    client.cookies.set("atelier_token", token)
    await client.put(
        "/admin/llm/providers/openai",
        json={
            "models": ["gpt-4o-mini"],
            "is_default": True,
            "sort_order": 0,
            "llm_api_key": "sk-test",
        },
    )
    await _ensure_openai_registry_connected(db_session)

    async def fake_rag(self, *a, **k):
        return RAGContext(text="ctx", truncated=False)

    async def failing_stream(self, *a, **k) -> AsyncIterator[str]:
        raise ApiError(
            status_code=502,
            code="LLM_UPSTREAM_ERROR",
            message="LLM call failed",
        )
        if False:
            yield ""

    monkeypatch.setattr("app.services.rag_service.RAGService.build_context", fake_rag)
    monkeypatch.setattr(
        "app.services.llm_service.LLMService.chat_stream", failing_stream
    )

    r = await client.post(
        f"/projects/{pid}/sections/{section_id}/thread/messages",
        json={"content": "hello"},
    )
    assert r.status_code == 200, r.text
    assert _last_nonempty_line(r.text) == "data: [DONE]"
    g = await client.get(f"/projects/{pid}/sections/{section_id}/thread")
    assert g.status_code == 200
    asst_msgs = [m for m in g.json()["messages"] if m["role"] == "assistant"]
    assert any(m["content"] == "[error: LLM call failed]" for m in asst_msgs)


@pytest.mark.asyncio
async def test_stream_conflict_meta_populated(
    client: AsyncClient, db_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _sid, pid, section_id, email = await _project_section(client, sfx)
    await _promote_tool_admin(db_session, email)
    client.cookies.set("atelier_token", token)
    await client.put(
        "/admin/llm/providers/openai",
        json={
            "models": ["gpt-4o-mini"],
            "is_default": True,
            "sort_order": 0,
            "llm_api_key": "sk-test",
        },
    )
    await _ensure_openai_registry_connected(db_session)

    async def fake_rag(self, *a, **k):
        return RAGContext(text="ctx", truncated=True)

    async def fake_stream(self, *a, **k) -> AsyncIterator[str]:
        yield "x"

    async def fake_structured(self, *a, **k):
        return {
            "findings": [
                {
                    "finding_type": "conflict",
                    "description": "X contradicts Y",
                },
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
    assert len(meta["findings"]) == 1
    assert meta["findings"][0]["finding_type"] == "conflict"

    g = await client.get(f"/projects/{pid}/sections/{section_id}/thread")
    assert g.status_code == 200
    asst = [m for m in g.json()["messages"] if m["role"] == "assistant"][-1]
    assert "**Conflicts and gaps**" in asst["content"]
    assert "X contradicts Y" in asst["content"]


@pytest.mark.asyncio
async def test_thread_post_passes_plaintext_override_to_rag(
    client: AsyncClient, db_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _sid, pid, section_id, email = await _project_section(client, sfx)
    await _promote_tool_admin(db_session, email)
    client.cookies.set("atelier_token", token)
    await client.put(
        "/admin/llm/providers/openai",
        json={
            "models": ["gpt-4o-mini"],
            "is_default": True,
            "sort_order": 0,
            "llm_api_key": "sk-test",
        },
    )
    await _ensure_openai_registry_connected(db_session)
    captured: dict[str, object] = {}

    async def cap_rag(self, *a: object, **k: object) -> RAGContext:
        captured.update(k)
        return RAGContext(text="ctx", truncated=False)

    async def fake_stream(self, *a: object, **k: object) -> AsyncIterator[str]:
        yield "ok"

    async def fake_structured(self, *a: object, **k: object) -> dict[str, object]:
        return {"findings": []}

    monkeypatch.setattr("app.services.rag_service.RAGService.build_context", cap_rag)
    monkeypatch.setattr("app.services.llm_service.LLMService.chat_stream", fake_stream)
    monkeypatch.setattr(
        "app.services.llm_service.LLMService.chat_structured", fake_structured
    )

    r = await client.post(
        f"/projects/{pid}/sections/{section_id}/thread/messages",
        json={
            "content": "hello",
            "current_section_plaintext": "LIVE_FROM_EDITOR",
        },
    )
    assert r.status_code == 200, r.text
    assert captured.get("current_section_plaintext_override") == "LIVE_FROM_EDITOR"


@pytest.mark.asyncio
async def test_thread_post_passes_include_git_history_to_rag(
    client: AsyncClient, db_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _sid, pid, section_id, email = await _project_section(client, sfx)
    await _promote_tool_admin(db_session, email)
    client.cookies.set("atelier_token", token)
    await client.put(
        "/admin/llm/providers/openai",
        json={
            "models": ["gpt-4o-mini"],
            "is_default": True,
            "sort_order": 0,
            "llm_api_key": "sk-test",
        },
    )
    await _ensure_openai_registry_connected(db_session)
    captured: dict[str, object] = {}

    async def cap_rag(self, *a: object, **k: object) -> RAGContext:
        captured.update(k)
        return RAGContext(text="ctx", truncated=False)

    async def fake_stream(self, *a: object, **k: object) -> AsyncIterator[str]:
        yield "ok"

    async def fake_structured(self, *a: object, **k: object) -> dict[str, object]:
        return {"findings": []}

    monkeypatch.setattr("app.services.rag_service.RAGService.build_context", cap_rag)
    monkeypatch.setattr("app.services.llm_service.LLMService.chat_stream", fake_stream)
    monkeypatch.setattr(
        "app.services.llm_service.LLMService.chat_structured", fake_structured
    )

    r = await client.post(
        f"/projects/{pid}/sections/{section_id}/thread/messages",
        json={"content": "hello", "include_git_history": True},
    )
    assert r.status_code == 200, r.text
    assert captured.get("include_git_history") is True


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
        "/admin/llm/providers/openai",
        json={
            "models": ["gpt-4o-mini"],
            "is_default": True,
            "sort_order": 0,
            "llm_api_key": "sk-test",
        },
    )
    await _ensure_openai_registry_connected(db_session)

    async def fake_rag(self, *a, **k):
        return RAGContext(text="ctx", truncated=False)

    async def fake_stream(self, *a, **k) -> AsyncIterator[str]:
        yield "ok"

    async def fake_structured(self, *a, **k):
        return {"findings": []}

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
        "/admin/llm/providers/openai",
        json={
            "models": ["gpt-4o-mini"],
            "is_default": True,
            "sort_order": 0,
            "llm_api_key": "sk-test",
        },
    )
    await _ensure_openai_registry_connected(db_session)

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
        "/admin/llm/providers/openai",
        json={
            "models": ["gpt-4o-mini"],
            "is_default": True,
            "sort_order": 0,
            "llm_api_key": "sk-test",
        },
    )
    await _ensure_openai_registry_connected(db_session)
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
        return {"findings": []}

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


@pytest.mark.asyncio
async def test_reset_thread_clears_history(
    client: AsyncClient, db_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _sid, pid, section_id, email = await _project_section(client, sfx)
    await _promote_tool_admin(db_session, email)
    client.cookies.set("atelier_token", token)
    await client.put(
        "/admin/llm/providers/openai",
        json={
            "models": ["gpt-4o-mini"],
            "is_default": True,
            "sort_order": 0,
            "llm_api_key": "sk-test",
        },
    )
    await _ensure_openai_registry_connected(db_session)

    async def fake_rag(self, *a, **k):
        return RAGContext(text="ctx", truncated=False)

    async def fake_stream(self, *a, **k) -> AsyncIterator[str]:
        yield "ok"

    async def fake_structured(self, *a, **k):
        return {"findings": []}

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

    g1 = await client.get(f"/projects/{pid}/sections/{section_id}/thread")
    assert g1.status_code == 200
    assert len(g1.json()["messages"]) >= 1

    d = await client.delete(f"/projects/{pid}/sections/{section_id}/thread")
    assert d.status_code == 204

    g2 = await client.get(f"/projects/{pid}/sections/{section_id}/thread")
    assert g2.status_code == 200
    assert g2.json()["messages"] == []


@pytest.mark.asyncio
async def test_viewer_cannot_reset_thread(
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
    r = await client.delete(f"/projects/{pid}/sections/{section_id}/thread")
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_reset_thread_idempotent_204_when_missing(
    client: AsyncClient,
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _sid, pid, section_id, _ = await _project_section(client, sfx)
    client.cookies.set("atelier_token", token)
    r = await client.delete(f"/projects/{pid}/sections/{section_id}/thread")
    assert r.status_code == 204


@pytest.mark.asyncio
async def test_replace_selection_422_without_plaintext_override(
    client: AsyncClient, db_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _sid, pid, section_id, email = await _project_section(client, sfx)
    await _promote_tool_admin(db_session, email)
    client.cookies.set("atelier_token", token)
    await client.put(
        "/admin/llm/providers/openai",
        json={
            "models": ["gpt-4o-mini"],
            "is_default": True,
            "sort_order": 0,
            "llm_api_key": "sk-test",
        },
    )
    await _ensure_openai_registry_connected(db_session)

    async def fake_rag(self, *a, **k):
        return RAGContext(text="ctx", truncated=False)

    monkeypatch.setattr("app.services.rag_service.RAGService.build_context", fake_rag)

    patch_r = await client.patch(
        f"/projects/{pid}/sections/{section_id}",
        json={"content": "abcd"},
    )
    assert patch_r.status_code == 200

    r = await client.post(
        f"/projects/{pid}/sections/{section_id}/thread/messages",
        json={
            "content": "replace foo",
            "thread_intent": "replace_selection",
            "selection_from": 0,
            "selection_to": 1,
            "selected_plaintext": "a",
        },
    )
    assert r.status_code == 422, r.text


@pytest.mark.asyncio
async def test_replace_selection_422_without_selection_bounds(
    client: AsyncClient, db_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _sid, pid, section_id, email = await _project_section(client, sfx)
    await _promote_tool_admin(db_session, email)
    client.cookies.set("atelier_token", token)
    await client.put(
        "/admin/llm/providers/openai",
        json={
            "models": ["gpt-4o-mini"],
            "is_default": True,
            "sort_order": 0,
            "llm_api_key": "sk-test",
        },
    )
    await _ensure_openai_registry_connected(db_session)

    async def fake_rag(self, *a, **k):
        return RAGContext(text="ctx", truncated=False)

    monkeypatch.setattr("app.services.rag_service.RAGService.build_context", fake_rag)

    r = await client.post(
        f"/projects/{pid}/sections/{section_id}/thread/messages",
        json={
            "content": "replace foo",
            "thread_intent": "replace_selection",
            "current_section_plaintext": "hello",
        },
    )
    assert r.status_code == 422, r.text


@pytest.mark.asyncio
async def test_stream_meta_patch_proposal_append(
    client: AsyncClient, db_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, _sid, pid, section_id, email = await _project_section(client, sfx)
    await _promote_tool_admin(db_session, email)
    client.cookies.set("atelier_token", token)
    await client.put(
        "/admin/llm/providers/openai",
        json={
            "models": ["gpt-4o-mini"],
            "is_default": True,
            "sort_order": 0,
            "llm_api_key": "sk-test",
        },
    )
    await _ensure_openai_registry_connected(db_session)

    async def fake_rag(self, *a, **k):
        return RAGContext(text="ctx", truncated=False)

    async def fake_stream(self, *a, **k) -> AsyncIterator[str]:
        yield "done"

    async def fake_structured(self, *a, **k) -> dict[str, object]:
        ct = k.get("call_source")
        if ct == "thread_conflict_scan":
            return {"findings": []}
        if ct == "thread_patch_append":
            return {"markdown_to_append": "\n## New heading\n"}
        return {}

    monkeypatch.setattr("app.services.rag_service.RAGService.build_context", fake_rag)
    monkeypatch.setattr("app.services.llm_service.LLMService.chat_stream", fake_stream)
    monkeypatch.setattr(
        "app.services.llm_service.LLMService.chat_structured", fake_structured
    )

    r = await client.post(
        f"/projects/{pid}/sections/{section_id}/thread/messages",
        json={
            "content": "add a heading",
            "thread_intent": "append",
            "current_section_plaintext": "# Title\n",
        },
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
    pp = meta.get("patch_proposal")
    assert isinstance(pp, dict)
    assert pp.get("intent") == "append"
    assert "markdown_to_append" in pp


@pytest.mark.asyncio
async def test_stream_rejects_disallowed_preferred_model(
    client: AsyncClient, db_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, studio_id_str, pid, section_id, email = await _project_section(client, sfx)
    await _promote_tool_admin(db_session, email)
    client.cookies.set("atelier_token", token)
    await client.put(
        "/admin/llm/providers/openai",
        json={
            "models": ["gpt-4o-mini"],
            "is_default": True,
            "sort_order": 0,
            "llm_api_key": "sk-test",
        },
    )
    await _ensure_openai_registry_connected(db_session)
    sid = uuid.UUID(studio_id_str)
    prov_key = f"prov_thr_{sfx}"
    db_session.add(
        LlmProviderRegistry(
            id=uuid.uuid4(),
            provider_id=prov_key,
            models_json=json.dumps(["gpt-4o-mini", "gpt-4o"]),
            status="connected",
            is_default=True,
            sort_order=0,
        )
    )
    db_session.add(
        LlmRoutingRule(
            use_case="chat",
            primary_model="gpt-4o-mini",
            fallback_model=None,
        )
    )
    db_session.add(
        StudioLlmProviderPolicy(
            studio_id=sid,
            provider_id=prov_key,
            enabled=True,
            selected_model="gpt-4o-mini",
        )
    )
    await db_session.flush()

    async def fake_rag(self, *a, **k):
        return RAGContext(text="ctx", truncated=False)

    monkeypatch.setattr("app.services.rag_service.RAGService.build_context", fake_rag)

    r = await client.post(
        f"/projects/{pid}/sections/{section_id}/thread/messages",
        json={"content": "hello", "preferred_model": "gpt-4o"},
    )
    assert r.status_code == 400, r.text
    err = r.json()
    assert err.get("code") == "CHAT_MODEL_NOT_ALLOWED"


@pytest.mark.asyncio
async def test_stream_accepts_allowed_preferred_model(
    client: AsyncClient, db_session, monkeypatch: pytest.MonkeyPatch
) -> None:
    sfx = uuid.uuid4().hex[:8]
    token, studio_id_str, pid, section_id, email = await _project_section(client, sfx)
    await _promote_tool_admin(db_session, email)
    client.cookies.set("atelier_token", token)
    await client.put(
        "/admin/llm/providers/openai",
        json={
            "models": ["gpt-4o-mini"],
            "is_default": True,
            "sort_order": 0,
            "llm_api_key": "sk-test",
        },
    )
    await _ensure_openai_registry_connected(db_session)
    sid = uuid.UUID(studio_id_str)
    prov_key = f"prov_thr2_{sfx}"
    db_session.add(
        LlmProviderRegistry(
            id=uuid.uuid4(),
            provider_id=prov_key,
            models_json=json.dumps(["gpt-4o-mini", "gpt-4o"]),
            status="connected",
            is_default=True,
            sort_order=0,
        )
    )
    db_session.add(
        LlmRoutingRule(
            use_case="chat",
            primary_model="gpt-4o-mini",
            fallback_model=None,
        )
    )
    db_session.add(
        StudioLlmProviderPolicy(
            studio_id=sid,
            provider_id=prov_key,
            enabled=True,
            selected_model="gpt-4o-mini",
        )
    )
    await db_session.flush()

    async def fake_rag(self, *a, **k):
        return RAGContext(text="ctx", truncated=False)

    async def fake_stream(self, *a, **k) -> AsyncIterator[str]:
        assert k.get("preferred_model") == "gpt-4o-mini"
        yield "ok"

    async def fake_structured(self, *a, **k):
        return {"findings": []}

    monkeypatch.setattr("app.services.rag_service.RAGService.build_context", fake_rag)
    monkeypatch.setattr("app.services.llm_service.LLMService.chat_stream", fake_stream)
    monkeypatch.setattr(
        "app.services.llm_service.LLMService.chat_structured", fake_structured
    )

    r = await client.post(
        f"/projects/{pid}/sections/{section_id}/thread/messages",
        json={"content": "hello", "preferred_model": "gpt-4o-mini"},
    )
    assert r.status_code == 200, r.text
