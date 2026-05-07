"""Shared project chat — persistence and LLM reply."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ApiError
from app.models import ChatMessage, Project, Software
from app.schemas.token_context import TokenContext
from app.services.llm_service import LLMService
from app.services.rag_service import RAGService


class ProjectChatService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list_history(
        self,
        *,
        project_id: uuid.UUID,
        before_id: uuid.UUID | None,
        limit: int,
    ) -> tuple[list[ChatMessage], uuid.UUID | None]:
        """Return newest-first messages (for infinite scroll)."""
        lim = max(1, min(limit, 100))
        stmt = (
            select(ChatMessage)
            .where(ChatMessage.project_id == project_id)
            .order_by(ChatMessage.created_at.desc())
            .limit(lim + 1)
        )
        if before_id:
            pivot = await self.db.get(ChatMessage, before_id)
            if pivot is None or pivot.project_id != project_id:
                raise ApiError(
                    status_code=400,
                    code="BAD_REQUEST",
                    message="Invalid before cursor.",
                )
            stmt = (
                select(ChatMessage)
                .where(
                    ChatMessage.project_id == project_id,
                    ChatMessage.created_at < pivot.created_at,
                )
                .order_by(ChatMessage.created_at.desc())
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
        project_id: uuid.UUID,
        user_id: uuid.UUID | None,
        role: str,
        content: str,
    ) -> ChatMessage:
        msg = ChatMessage(
            id=uuid.uuid4(),
            project_id=project_id,
            user_id=user_id,
            role=role,
            content=content,
        )
        self.db.add(msg)
        await self.db.flush()
        return msg

    async def openai_messages_for_project(
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

    async def stream_assistant_tokens(
        self,
        *,
        project_id: uuid.UUID,
        user_id: uuid.UUID,
        user_content: str,
        chat_messages: list[dict[str, str]] | None = None,
        preferred_model: str | None = None,
    ) -> AsyncIterator[tuple[str, TokenContext]]:
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

        ctx = TokenContext(
            studio_id=software.studio_id,
            software_id=software.id,
            project_id=project_id,
            user_id=user_id,
        )

        openai_msgs = (
            chat_messages
            if chat_messages is not None
            else await self.openai_messages_for_project(project_id)
        )
        rag = await RAGService(self.db).build_context(
            query=user_content,
            project_id=project_id,
            current_section_id=None,
            token_budget=6000,
        )
        system_prompt = (
            "You are a concise assistant helping the whole project team discuss "
            "the specification and implementation. Ground answers in the context.\n\n"
            + rag.text
        )

        llm = LLMService(self.db)
        try:
            async for piece in llm.chat_stream(
                system_prompt=system_prompt,
                messages=openai_msgs,
                context=ctx,
                call_type="chat",
                preferred_model=preferred_model,
            ):
                yield piece, ctx
        except Exception:
            yield "[error: LLM call failed]", ctx
