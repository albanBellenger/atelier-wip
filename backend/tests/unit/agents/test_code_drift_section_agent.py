"""Unit tests for CodeDriftSectionAgent (mocked LLM)."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.code_drift_section_agent import CodeDriftSectionAgent
from app.schemas.token_usage_scope import TokenUsageScope
from app.services.llm_service import LLMService


@pytest.mark.asyncio
async def test_analyse_forwards_schema_and_call_source(db_session: AsyncSession) -> None:
    llm = AsyncMock(spec=LLMService)
    llm.chat_structured = AsyncMock(
        return_value={
            "likely_drifted": True,
            "severity": "medium",
            "reason": "Doc says X; code does Y.",
            "code_refs": [{"path": "a.py", "start_line": 1, "end_line": 5}],
        }
    )
    ctx = TokenUsageScope(
        studio_id=uuid.uuid4(),
        software_id=uuid.uuid4(),
        project_id=None,
        user_id=uuid.uuid4(),
    )
    agent = CodeDriftSectionAgent(db_session, llm)  # type: ignore[arg-type]
    out = await agent.analyse(
        ctx,
        sw_name="Billing",
        def_block="Handles invoices.",
        section_title="Auth",
        section_body="Uses JWT",
        repo_map_blob="src/a.py",
        code_chunks_blob="snippet",
    )
    assert out["likely_drifted"] is True
    llm.chat_structured.assert_awaited_once()
    kw = llm.chat_structured.await_args.kwargs
    assert kw["call_source"] == "code_drift_section"
    assert kw["json_schema"]["name"] == "code_drift_section"
    assert "Billing" in kw["system_prompt"]
    assert "Handles invoices." in kw["system_prompt"]
    assert "Return JSON only" in kw["user_prompt"]
    assert "Auth" in kw["user_prompt"]
    assert "snippet" in kw["user_prompt"]
