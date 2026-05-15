"""Unit tests for BackpropOutlineAgent (mocked LLM)."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.backprop_outline_agent import BackpropOutlineAgent, BACKPROP_OUTLINE_JSON_SCHEMA
from app.schemas.token_usage_scope import TokenUsageScope


@pytest.mark.asyncio
async def test_propose_outline_calls_chat_structured_with_schema() -> None:
    session = AsyncMock(spec=AsyncSession)
    llm = MagicMock()
    llm.chat_structured = AsyncMock(
        return_value={
            "sections": [
                {"title": "API", "slug": "api", "summary": "REST surface."},
            ]
        }
    )
    ctx = TokenUsageScope(
        studio_id=uuid.uuid4(),
        software_id=uuid.uuid4(),
        project_id=None,
        user_id=uuid.uuid4(),
    )
    out = await BackpropOutlineAgent(session, llm).propose_outline(
        ctx,
        sw_name="My SW",
        def_block="Does things.",
        repo_map_blob="src/a.py",
        hint="focus on API",
    )
    assert out["sections"][0]["slug"] == "api"
    llm.chat_structured.assert_awaited_once()
    kw = llm.chat_structured.await_args.kwargs
    assert kw["json_schema"] == BACKPROP_OUTLINE_JSON_SCHEMA
    assert kw["call_source"] == "backprop_outline"
    assert "My SW" in kw["system_prompt"]
    assert "Repository map" in kw["user_prompt"]
    assert "focus on API" in kw["user_prompt"]
    assert "Optional hint from the user" in kw["user_prompt"]
