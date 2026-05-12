"""Unit tests for BackpropSectionAgent (mocked LLM)."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.backprop_section_agent import BackpropSectionAgent, BACKPROP_SECTION_JSON_SCHEMA
from app.schemas.token_usage_scope import TokenUsageScope


@pytest.mark.asyncio
async def test_propose_section_calls_chat_structured_with_schema(
    db_session: AsyncSession,
) -> None:
    llm = MagicMock()
    llm.chat_structured = AsyncMock(
        return_value={
            "markdown": "## Intro\nUse `src/main.py`.",
            "source_files": ["src/main.py"],
        }
    )
    ctx = TokenUsageScope(
        studio_id=uuid.uuid4(),
        software_id=uuid.uuid4(),
        project_id=None,
        user_id=uuid.uuid4(),
    )
    out = await BackpropSectionAgent(db_session, llm).propose_section(
        ctx,
        sw_name="Svc",
        def_block="Service definition.",
        section_title="Overview",
        section_summary="Old text.",
        repo_map_blob="src/main.py",
        code_chunks_blob="=== src/main.py\nprint(1)\n",
    )
    assert "main.py" in out["markdown"]
    assert out["source_files"] == ["src/main.py"]
    llm.chat_structured.assert_awaited_once()
    kw = llm.chat_structured.await_args.kwargs
    assert kw["json_schema"] == BACKPROP_SECTION_JSON_SCHEMA
    assert kw["call_source"] == "backprop_section"
    assert "Overview" in kw["user_prompt"]
