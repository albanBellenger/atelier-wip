"""Project-scoped chat LLM streaming (caller supplies RAG-augmented system prompt prefix)."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ApiError
from app.models import ChatMessage, Project, Software
from app.schemas.token_usage_scope import TokenUsageScope
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
        user_id: uuid.UUID,
        user_content: str,
        chat_messages: list[dict[str, str]] | None = None,
        preferred_model: str | None = None,
        rag_text: str,
    ) -> AsyncIterator[tuple[str, TokenUsageScope]]:
        """Yield LLM token strings; caller persists assistant message after iteration."""
        project = await self.db.get(Project, project_id)
        if project is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Project not found.",
            )
        software = await self.db.get(Software, project.software_id)
        if software is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Software not found.",
            )

        ctx = TokenUsageScope(
            studio_id=software.studio_id,
            software_id=software.id,
            project_id=project_id,
            user_id=user_id,
        )

        openai_msgs = (
            chat_messages
            if chat_messages is not None
            else await self._openai_messages_for_project(project_id)
        )
        _ = user_content
        system_prompt = self.build_system_prompt(rag_text)

        try:
            async for piece in self.llm.chat_stream(
                system_prompt=system_prompt,
                messages=openai_msgs,
                usage_scope=ctx,
                call_type="chat",
                preferred_model=preferred_model,
            ):
                yield piece, ctx
        except Exception:
            yield "[error: LLM call failed]", ctx

    async def _openai_messages_for_project(
        self, project_id: uuid.UUID, max_messages: int = 40
    ) -> list[dict[str, str]]:
        stmt = (
            select(ChatMessage)
            .where(ChatMessage.project_id == project_id)
            .order_by(ChatMessage.created_at.desc())
            .limit(max_messages)
        )
        rows = list(reversed((await self.db.execute(stmt)).scalars().all()))
        return [{"role": m.role, "content": m.content} for m in rows]
