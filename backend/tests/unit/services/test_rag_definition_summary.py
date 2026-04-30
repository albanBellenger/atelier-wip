"""Software definition summarisation + cache (Slice 6 RAG)."""

import uuid
from unittest.mock import MagicMock

import pytest

from app.schemas.token_context import TokenContext
from app.services.rag_service import RAGService, SOFT_DEF_TOKEN_CAP


@pytest.mark.asyncio
async def test_large_definition_summarised_and_cached(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[int] = []

    async def fake_chat_structured(self, **kwargs: object) -> dict:
        calls.append(1)
        return {"summary": "compressed-definition"}

    monkeypatch.setattr(
        "app.services.llm_service.LLMService.chat_structured",
        fake_chat_structured,
    )

    db = MagicMock()
    rag = RAGService(db)
    sw = MagicMock()
    sw.id = uuid.uuid4()
    sw.definition = "W" * (SOFT_DEF_TOKEN_CAP * 4 + 50)
    ctx = TokenContext(
        studio_id=uuid.uuid4(),
        software_id=sw.id,
        project_id=uuid.uuid4(),
        user_id=None,
    )
    first = await rag._definition_block_for_rag(sw, ctx)
    second = await rag._definition_block_for_rag(sw, ctx)
    assert first == second == "compressed-definition"
    assert len(calls) == 1
