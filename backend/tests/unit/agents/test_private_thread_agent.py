"""Unit tests for PrivateThreadAgent (prompt prefix + LLM call shape)."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.agents._atelier_product_prefix import ATELIER_PRODUCT_PREFIX
from app.agents.private_thread_agent import (
    PRIVATE_THREAD_CRITIQUE_PERSONA,
    PRIVATE_THREAD_DEFAULT_CHAT_PERSONA,
    PRIVATE_THREAD_IMPROVE_PERSONA,
    THREAD_FINDINGS_SCAN_SYSTEM_PROMPT,
    THREAD_PATCH_APPEND_SYSTEM_PROMPT,
    THREAD_PATCH_EDIT_SYSTEM_PROMPT,
    THREAD_PATCH_REPLACE_SYSTEM_PROMPT,
    PrivateThreadAgent,
)
from app.agents.conflict_agent import SYSTEM_PROMPT as CONFLICT_SYSTEM_PROMPT
from app.schemas.token_usage_scope import TokenUsageScope


def test_conflict_agent_system_prompt_starts_with_product_prefix() -> None:
    assert CONFLICT_SYSTEM_PROMPT.startswith(ATELIER_PRODUCT_PREFIX)


def test_private_thread_persona_constants_start_with_prefix() -> None:
    assert PRIVATE_THREAD_DEFAULT_CHAT_PERSONA.startswith(ATELIER_PRODUCT_PREFIX)
    assert PRIVATE_THREAD_CRITIQUE_PERSONA.startswith(ATELIER_PRODUCT_PREFIX)
    assert PRIVATE_THREAD_IMPROVE_PERSONA.startswith(ATELIER_PRODUCT_PREFIX)


def test_private_thread_structured_system_prompts_start_with_prefix() -> None:
    assert THREAD_FINDINGS_SCAN_SYSTEM_PROMPT.startswith(ATELIER_PRODUCT_PREFIX)
    assert THREAD_PATCH_APPEND_SYSTEM_PROMPT.startswith(ATELIER_PRODUCT_PREFIX)
    assert THREAD_PATCH_REPLACE_SYSTEM_PROMPT.startswith(ATELIER_PRODUCT_PREFIX)
    assert THREAD_PATCH_EDIT_SYSTEM_PROMPT.startswith(ATELIER_PRODUCT_PREFIX)


@pytest.mark.asyncio
async def test_stream_main_reply_sets_call_source_private_thread() -> None:
    db = AsyncMock()
    llm = MagicMock()

    async def fake_stream(**kwargs: Any) -> AsyncIterator[str]:
        assert kwargs["call_source"] == "private_thread"
        assert kwargs["system_prompt"].startswith(ATELIER_PRODUCT_PREFIX)
        yield "x"

    llm.chat_stream = fake_stream
    agent = PrivateThreadAgent(db, llm)  # type: ignore[arg-type]
    ctx = TokenUsageScope(
        studio_id=uuid.uuid4(),
        software_id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
    )
    state: dict[str, Any] = {}
    out = [
        p
        async for p in agent.stream_main_reply(
            system_prompt=ATELIER_PRODUCT_PREFIX + "body",
            openai_msgs=[{"role": "user", "content": "hi"}],
            ctx=ctx,
            stream_state=state,
        )
    ]
    assert out == ["x"]
    assert state.get("stream_failed") is False


@pytest.mark.asyncio
async def test_scan_for_findings_uses_prefixed_system_prompt() -> None:
    db = AsyncMock()
    llm = MagicMock()
    captured: dict[str, Any] = {}

    async def capture_structured(**kwargs: Any) -> dict[str, Any]:
        captured.update(kwargs)
        return {"findings": []}

    llm.chat_structured = capture_structured
    agent = PrivateThreadAgent(db, llm)  # type: ignore[arg-type]
    ctx = TokenUsageScope(
        studio_id=uuid.uuid4(),
        software_id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
    )
    await agent.scan_for_findings(
        user_message="u",
        full_text="assistant text",
        ctx=ctx,
    )
    assert captured.get("call_source") == "thread_conflict_scan"
    sp = captured.get("system_prompt")
    assert isinstance(sp, str) and sp.startswith(ATELIER_PRODUCT_PREFIX)


@pytest.mark.asyncio
async def test_build_patch_proposal_append_uses_prefixed_system_prompt() -> None:
    db = AsyncMock()
    llm = MagicMock()
    captured: dict[str, Any] = {}

    async def capture_structured(**kwargs: Any) -> dict[str, Any]:
        captured.update(kwargs)
        return {"markdown_to_append": "\n## x\n"}

    llm.chat_structured = capture_structured
    agent = PrivateThreadAgent(db, llm)  # type: ignore[arg-type]
    ctx = TokenUsageScope(
        studio_id=uuid.uuid4(),
        software_id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
    )
    await agent.build_patch_proposal(
        intent="append",
        effective_snap="# T\n",
        content="add",
        full="ok",
        selection_triple=None,
        ctx=ctx,
    )
    assert captured.get("call_source") == "thread_patch_append"
    sp = captured.get("system_prompt")
    assert isinstance(sp, str) and sp.startswith(ATELIER_PRODUCT_PREFIX)
