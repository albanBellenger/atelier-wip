"""Project chat service: streaming contract (usage scope from loaded entities)."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models import Project, Software
from app.schemas.token_usage_scope import TokenUsageScope
from app.services.project_chat_service import ProjectChatService


@pytest.mark.asyncio
async def test_stream_assistant_tokens_passes_usage_scope_from_loaded_software() -> None:
    """Agent receives TokenUsageScope built once from Project/Software rows (no duplicate load in agent)."""
    project_id = uuid.uuid4()
    software_id = uuid.uuid4()
    studio_id = uuid.uuid4()
    user_id = uuid.uuid4()

    project_row = MagicMock(spec=Project)
    project_row.software_id = software_id
    software_row = MagicMock(spec=Software)
    software_row.id = software_id
    software_row.studio_id = studio_id

    async def mock_get(model: type[Any], pk: uuid.UUID) -> Any:
        if model is Project and pk == project_id:
            return project_row
        if model is Software and pk == software_id:
            return software_row
        return None

    db = AsyncMock()
    db.get = AsyncMock(side_effect=mock_get)

    expected_scope = TokenUsageScope(
        studio_id=studio_id,
        software_id=software_id,
        project_id=project_id,
        user_id=user_id,
    )

    captured: dict[str, Any] = {}

    async def fake_stream_assistant_tokens(
        _self: Any,
        *,
        project_id: uuid.UUID,
        usage_scope: TokenUsageScope,
        chat_messages: list[dict[str, str]] | None,
        preferred_model: str | None,
        rag_text: str,
        debug_prompt_payload: dict[str, Any] | None = None,
    ) -> AsyncIterator[tuple[str, TokenUsageScope]]:
        captured["usage_scope"] = usage_scope
        captured["rag_text"] = rag_text
        yield "ok", usage_scope

    with (
        patch(
            "app.services.project_chat_service.RAGService"
        ) as rag_cls,
        patch(
            "app.services.project_chat_service.ProjectChatAgent.stream_assistant_tokens",
            new=fake_stream_assistant_tokens,
        ),
    ):
        rag_cls.return_value.build_context = AsyncMock(
            return_value=MagicMock(text="rag-body")
        )
        svc = ProjectChatService(db)
        chunks: list[str] = []
        async for piece, ctx in svc.stream_assistant_tokens(
            project_id=project_id,
            user_id=user_id,
            user_content="hello",
        ):
            chunks.append(piece)
            assert ctx == expected_scope

    assert chunks == ["ok"]
    assert captured["usage_scope"] == expected_scope
    assert captured["rag_text"] == "rag-body"
