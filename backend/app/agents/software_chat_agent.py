"""Software-scoped chat LLM streaming (no project RAG)."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.exceptions import ApiError
from app.models import Project, Software
from app.schemas.token_usage_scope import TokenUsageScope
from app.services.chat_openai_history import fetch_openai_messages_for_software
from app.services.llm_service import LLMService, serialize_outbound_chat_messages_for_debug

# ── Prompts ───────────────────────────────────────────────────────────────────

SOFTWARE_CHAT_SYSTEM_PROMPT_TEMPLATE = (
    "You are a concise assistant for the whole software product team "
    "(all projects under this software). "
    "Ground answers in the following product context only.\n\n"
    "Software name: {software_name}\n"
    "Description: {description}\n"
    "Project names under this software: {projects_line}\n\n"
    "Software definition (may be truncated):\n{def_blob}"
)

# User turns are supplied via the chat API `messages` list; no static user prompt body.
USER_PROMPT = ""

# ── Agent ─────────────────────────────────────────────────────────────────────


def _trim_text(text: str | None, max_chars: int) -> str:
    if not text:
        return ""
    t = text.strip()
    if len(t) <= max_chars:
        return t
    return t[: max_chars - 1] + "…"


class SoftwareChatAgent:
    def __init__(self, db: AsyncSession, llm: LLMService) -> None:
        self.db = db
        self.llm = llm

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
        return SOFTWARE_CHAT_SYSTEM_PROMPT_TEMPLATE.format(
            software_name=software.name,
            description=desc or "—",
            projects_line=projects_line,
            def_blob=def_blob or "—",
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
        software = await self.db.get(Software, software_id)
        if software is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Software not found.",
            )

        ctx = TokenUsageScope(
            studio_id=software.studio_id,
            software_id=software.id,
            project_id=None,
            user_id=user_id,
        )

        openai_msgs = (
            chat_messages
            if chat_messages is not None
            else await fetch_openai_messages_for_software(self.db, software_id)
        )
        system_prompt = await self.build_software_system_prompt(software_id)

        async for piece in self.llm.chat_stream(
            system_prompt=system_prompt,
            messages=openai_msgs,
            usage_scope=ctx,
            call_source="chat",
            preferred_model=preferred_model,
        ):
            yield piece, ctx

        if debug_prompt_payload is not None and get_settings().log_llm_prompts:
            full_messages: list[dict[str, Any]] = [
                {"role": "system", "content": system_prompt},
                *[dict(m) for m in openai_msgs],
            ]
            resolved_model = await self.llm.resolved_chat_model_for_scope(
                usage_scope=ctx,
                call_source="chat",
                preferred_model=preferred_model,
            )
            debug_prompt_payload["llm_outbound_messages"] = (
                serialize_outbound_chat_messages_for_debug(
                    full_messages, model=resolved_model
                )
            )
