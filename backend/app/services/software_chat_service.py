"""Shared software chat — persistence and LLM reply (no project-scoped RAG)."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.agents.software_chat_agent import SoftwareChatAgent
from app.exceptions import ApiError
from app.models import Software, SoftwareChatMessage
from app.schemas.token_usage_scope import TokenUsageScope
from app.services.chat_openai_history import (
    DEFAULT_OPENAI_CHAT_HISTORY_LIMIT,
    fetch_openai_messages_for_software,
)
from app.services.llm_service import LLMService


class SoftwareChatService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list_history(
        self,
        *,
        software_id: uuid.UUID,
        before_id: uuid.UUID | None,
        limit: int,
    ) -> tuple[list[SoftwareChatMessage], uuid.UUID | None]:
        """Return newest-first messages (for infinite scroll)."""
        lim = max(1, min(limit, 100))
        stmt = (
            select(SoftwareChatMessage)
            .options(selectinload(SoftwareChatMessage.user))
            .where(SoftwareChatMessage.software_id == software_id)
            .order_by(SoftwareChatMessage.created_at.desc())
            .limit(lim + 1)
        )
        if before_id:
            pivot = await self.db.get(SoftwareChatMessage, before_id)
            if pivot is None or pivot.software_id != software_id:
                raise ApiError(
                    status_code=400,
                    code="BAD_REQUEST",
                    message="Invalid before cursor.",
                )
            stmt = (
                select(SoftwareChatMessage)
                .options(selectinload(SoftwareChatMessage.user))
                .where(
                    SoftwareChatMessage.software_id == software_id,
                    SoftwareChatMessage.created_at < pivot.created_at,
                )
                .order_by(SoftwareChatMessage.created_at.desc())
                .limit(lim + 1)
            )
        rows = list((await self.db.execute(stmt)).scalars().all())
        next_before = None
        if len(rows) > lim:
            next_before = rows[lim].id
            rows = rows[:lim]
        return rows, next_before

    async def append_message(
        self,
        *,
        software_id: uuid.UUID,
        user_id: uuid.UUID | None,
        role: str,
        content: str,
    ) -> SoftwareChatMessage:
        msg = SoftwareChatMessage(
            id=uuid.uuid4(),
            software_id=software_id,
            user_id=user_id,
            role=role,
            content=content,
        )
        self.db.add(msg)
        await self.db.flush()
        return msg

    async def openai_messages_for_software(
        self,
        software_id: uuid.UUID,
        max_messages: int = DEFAULT_OPENAI_CHAT_HISTORY_LIMIT,
    ) -> list[dict[str, str]]:
        return await fetch_openai_messages_for_software(
            self.db, software_id, max_messages=max_messages
        )

    async def build_software_system_prompt(self, software_id: uuid.UUID) -> str:
        llm = LLMService(self.db)
        return await SoftwareChatAgent(self.db, llm).build_software_system_prompt(
            software_id
        )

    async def stream_assistant_tokens(
        self,
        *,
        software_id: uuid.UUID,
        user_id: uuid.UUID,
        preferred_model: str | None = None,
        chat_messages: list[dict[str, str]] | None = None,
        debug_prompt_payload: dict[str, Any] | None = None,
    ) -> AsyncIterator[tuple[str, TokenUsageScope]]:
        """Yield LLM token strings; caller persists assistant message after iteration."""
        llm = LLMService(self.db)
        agent = SoftwareChatAgent(self.db, llm)
        async for piece, ctx in agent.stream_assistant_tokens(
            software_id=software_id,
            user_id=user_id,
            preferred_model=preferred_model,
            chat_messages=chat_messages,
            debug_prompt_payload=debug_prompt_payload,
        ):
            yield piece, ctx
