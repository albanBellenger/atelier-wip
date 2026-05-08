"""Shared DB fetch for recent chat rows formatted as OpenAI-style message dicts."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ChatMessage, SoftwareChatMessage

DEFAULT_OPENAI_CHAT_HISTORY_LIMIT = 40


def _rows_to_openai_messages(
    rows: list[ChatMessage] | list[SoftwareChatMessage],
) -> list[dict[str, str]]:
    return [{"role": m.role, "content": m.content} for m in rows]


async def fetch_openai_messages_for_project(
    db: AsyncSession,
    project_id: uuid.UUID,
    *,
    max_messages: int = DEFAULT_OPENAI_CHAT_HISTORY_LIMIT,
) -> list[dict[str, str]]:
    stmt = (
        select(ChatMessage)
        .where(ChatMessage.project_id == project_id)
        .order_by(ChatMessage.created_at.desc())
        .limit(max_messages)
    )
    rows = list(reversed((await db.execute(stmt)).scalars().all()))
    return _rows_to_openai_messages(rows)


async def fetch_openai_messages_for_software(
    db: AsyncSession,
    software_id: uuid.UUID,
    *,
    max_messages: int = DEFAULT_OPENAI_CHAT_HISTORY_LIMIT,
) -> list[dict[str, str]]:
    stmt = (
        select(SoftwareChatMessage)
        .where(SoftwareChatMessage.software_id == software_id)
        .order_by(SoftwareChatMessage.created_at.desc())
        .limit(max_messages)
    )
    rows = list(reversed((await db.execute(stmt)).scalars().all()))
    return _rows_to_openai_messages(rows)
