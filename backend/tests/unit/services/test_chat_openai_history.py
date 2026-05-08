"""Unit tests for OpenAI-shaped chat history fetch helpers."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.dialects import postgresql

from app.services.chat_openai_history import (
    DEFAULT_OPENAI_CHAT_HISTORY_LIMIT,
    fetch_openai_messages_for_project,
    fetch_openai_messages_for_software,
)


def _mock_result(rows: list[MagicMock]) -> MagicMock:
    scalars = MagicMock()
    scalars.all.return_value = rows
    result_mock = MagicMock()
    result_mock.scalars.return_value = scalars
    return result_mock


@pytest.mark.asyncio
async def test_fetch_openai_messages_for_project_reverses_to_chronological() -> None:
    """DB returns newest-first; OpenAI messages must be oldest-first."""
    project_id = uuid.uuid4()
    row_new = MagicMock()
    row_new.role = "assistant"
    row_new.content = "new"
    row_old = MagicMock()
    row_old.role = "user"
    row_old.content = "old"

    db = AsyncMock()
    db.execute = AsyncMock(return_value=_mock_result([row_new, row_old]))

    out = await fetch_openai_messages_for_project(db, project_id)

    assert out == [
        {"role": "user", "content": "old"},
        {"role": "assistant", "content": "new"},
    ]


@pytest.mark.asyncio
async def test_fetch_openai_messages_for_software_reverses_to_chronological() -> None:
    software_id = uuid.uuid4()
    row_new = MagicMock()
    row_new.role = "assistant"
    row_new.content = "b"
    row_old = MagicMock()
    row_old.role = "user"
    row_old.content = "a"

    db = AsyncMock()
    db.execute = AsyncMock(return_value=_mock_result([row_new, row_old]))

    out = await fetch_openai_messages_for_software(db, software_id)

    assert out == [
        {"role": "user", "content": "a"},
        {"role": "assistant", "content": "b"},
    ]


@pytest.mark.asyncio
async def test_fetch_openai_messages_for_project_respects_max_messages() -> None:
    """Statement should include LIMIT derived from max_messages."""
    project_id = uuid.uuid4()
    db = AsyncMock()
    db.execute = AsyncMock(return_value=_mock_result([]))

    await fetch_openai_messages_for_project(db, project_id, max_messages=7)

    assert db.execute.await_count == 1
    stmt = db.execute.await_args[0][0]
    compiled = str(stmt.compile(dialect=postgresql.dialect()))
    assert "LIMIT" in compiled.upper()


@pytest.mark.asyncio
async def test_default_limit_constant_is_40() -> None:
    assert DEFAULT_OPENAI_CHAT_HISTORY_LIMIT == 40
