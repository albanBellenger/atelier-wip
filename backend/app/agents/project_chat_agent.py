"""Project-scoped chat LLM streaming (caller supplies RAG-augmented system prompt prefix)."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.token_usage_scope import TokenUsageScope
from app.services.chat_openai_history import fetch_openai_messages_for_project
from app.services.llm_service import LLMService

# ── Prompts ───────────────────────────────────────────────────────────────────

PROJECT_CHAT_SYSTEM_PROMPT_PREFIX = (
    "You are a concise assistant helping the whole project team discuss "
    "the specification and implementation. Ground answers in the context.\n\n"
)

# User turns are supplied via the chat API `messages` list; no static user prompt body.
USER_PROMPT = ""

# ── Agent ─────────────────────────────────────────────────────────────────────


class ProjectChatAgent:
    def __init__(self, db: AsyncSession, llm: LLMService) -> None:
        self.db = db
        self.llm = llm

    @staticmethod
    def build_system_prompt(rag_text: str) -> str:
        return PROJECT_CHAT_SYSTEM_PROMPT_PREFIX + rag_text

    async def stream_assistant_tokens(
        self,
        *,
        project_id: uuid.UUID,
        usage_scope: TokenUsageScope,
        chat_messages: list[dict[str, str]] | None = None,
        preferred_model: str | None = None,
        rag_text: str,
    ) -> AsyncIterator[tuple[str, TokenUsageScope]]:
        """Yield LLM token strings; caller persists assistant message after iteration.

        Caller must load project/software, enforce access, and build ``usage_scope``.
        """
        openai_msgs = (
            chat_messages
            if chat_messages is not None
            else await fetch_openai_messages_for_project(self.db, project_id)
        )
        system_prompt = self.build_system_prompt(rag_text)

        async for piece in self.llm.chat_stream(
            system_prompt=system_prompt,
            messages=openai_msgs,
            usage_scope=usage_scope,
            call_source="chat",
            preferred_model=preferred_model,
        ):
            yield piece, usage_scope
