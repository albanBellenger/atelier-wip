"""Unit tests for DocSyncAgent (mocked LLM)."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.doc_sync_agent import DocSyncAgent
from app.schemas.token_usage_scope import TokenUsageScope
from app.services.llm_service import LLMService


@pytest.mark.asyncio
async def test_propose_patches_forwards_schema_and_call_source(
    db_session: AsyncSession,
) -> None:
    llm = MagicMock(spec=LLMService)
    llm.chat_structured = AsyncMock(
        return_value={
            "proposals": [
                {
                    "section_id": str(uuid.uuid4()),
                    "rationale": "Align docs with behaviour.",
                    "replacement_markdown": "# Title\n\nBody.",
                }
            ]
        }
    )
    ctx = TokenUsageScope(studio_id=uuid.uuid4(), software_id=uuid.uuid4())
    out = await DocSyncAgent(db_session, llm).propose_patches(
        ctx,
        sw_name="Sw",
        def_block="Def",
        wo_title="T",
        wo_description="D",
        wo_acceptance_criteria="AC",
        candidate_sections_blob="(candidates)",
        code_chunks_blob="(chunks)",
    )
    assert "proposals" in out
    llm.chat_structured.assert_awaited_once()
    kw = llm.chat_structured.await_args.kwargs
    assert kw.get("call_source") == "doc_sync"
    assert kw.get("json_schema", {}).get("name") == "doc_sync_proposals"
