"""Shared software chat — persistence and LLM reply (no project-scoped RAG)."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ApiError
from app.models import Project, Software, SoftwareChatMessage
from app.schemas.token_context import TokenContext
from app.services.llm_service import LLMService


def _trim_text(text: str | None, max_chars: int) -> str:
    if not text:
        return ""
    t = text.strip()
    if len(t) <= max_chars:
        return t
    return t[: max_chars - 1] + "…"


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
        self, software_id: uuid.UUID, max_messages: int = 40
    ) -> list[dict[str, str]]:
        stmt = (
            select(SoftwareChatMessage)
            .where(SoftwareChatMessage.software_id == software_id)
            .order_by(SoftwareChatMessage.created_at.desc())
            .limit(max_messages)
        )
        rows = list(reversed((await self.db.execute(stmt)).scalars().all()))
        return [{"role": m.role, "content": m.content} for m in rows]

    async def build_software_system_prompt(self, software_id: uuid.UUID) -> str:
        software = await self.db.get(Software, software_id)
        if software is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Software not found.",
            )
        names_stmt = (
            select(Project.name)
            .where(Project.software_id == software_id)
            .order_by(Project.name.asc())
            .limit(40)
        )
        names = list((await self.db.execute(names_stmt)).scalars().all())
        projects_line = (
            ", ".join(n for n in names if n)
            if names
            else "(no projects yet)"
        )
        def_blob = _trim_text(software.definition, 12_000)
        desc = _trim_text(software.description, 2000)
        return (
            "You are a concise assistant for the whole software product team "
            "(all projects under this software). "
            "Ground answers in the following product context only.\n\n"
            f"Software name: {software.name}\n"
            f"Description: {desc or '—'}\n"
            f"Project names under this software: {projects_line}\n\n"
            f"Software definition (may be truncated):\n{def_blob or '—'}"
        )

    async def stream_assistant_tokens(
        self,
        *,
        software_id: uuid.UUID,
        user_id: uuid.UUID,
        user_content: str,
        preferred_model: str | None = None,
        chat_messages: list[dict[str, str]] | None = None,
    ) -> AsyncIterator[tuple[str, TokenContext]]:
        """Yield LLM token strings; caller persists assistant message after iteration."""
        software = await self.db.get(Software, software_id)
        if software is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Software not found.",
            )

        ctx = TokenContext(
            studio_id=software.studio_id,
            software_id=software.id,
            project_id=None,
            user_id=user_id,
        )

        openai_msgs = (
            chat_messages
            if chat_messages is not None
            else await self.openai_messages_for_software(software_id)
        )
        system_prompt = await self.build_software_system_prompt(software_id)

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
