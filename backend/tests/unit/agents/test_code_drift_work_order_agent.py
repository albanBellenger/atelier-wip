"""Unit tests for CodeDriftWorkOrderAgent (mocked LLM)."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.code_drift_work_order_agent import CodeDriftWorkOrderAgent
from app.schemas.token_usage_scope import TokenUsageScope
from app.services.llm_service import LLMService


@pytest.mark.asyncio
async def test_analyse_forwards_schema_and_call_source(db_session: AsyncSession) -> None:
    llm = AsyncMock(spec=LLMService)
    llm.chat_structured = AsyncMock(
        return_value={
            "verdict": "partial",
            "reason": "Acceptance criteria not clearly implemented.",
            "code_refs": [{"path": "b.py", "start_line": 2, "end_line": 8}],
        }
    )
    ctx = TokenUsageScope(
        studio_id=uuid.uuid4(),
        software_id=uuid.uuid4(),
        project_id=None,
        user_id=uuid.uuid4(),
    )
    agent = CodeDriftWorkOrderAgent(db_session, llm)  # type: ignore[arg-type]
    out = await agent.analyse(
        ctx,
        sw_name="Tasks",
        def_block="Job runner.",
        wo_title="Add login",
        wo_description="OAuth",
        wo_acceptance_criteria="Works",
        repo_map_blob="src/b.py",
        code_chunks_blob="snippet",
    )
    assert out["verdict"] == "partial"
    kw = llm.chat_structured.await_args.kwargs
    assert kw["call_source"] == "code_drift_work_order"
    assert kw["json_schema"]["name"] == "code_drift_work_order"
    assert "Tasks" in kw["system_prompt"]
    assert "Job runner." in kw["system_prompt"]
    assert "Return JSON only" in kw["user_prompt"]
    assert "Add login" in kw["user_prompt"]
