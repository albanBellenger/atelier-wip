"""Unit tests for dependency helpers."""

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.deps import resolve_studio_access_for_software
from app.models import CrossStudioAccess, Software


@pytest.mark.asyncio
async def test_resolve_studio_access_for_software_cross_studio_single_execute_grants() -> (
    None
):
    """Cross-studio grant resolution uses one joined query (no per-grant loop)."""
    studio_id = uuid.uuid4()
    sw_id = uuid.uuid4()
    user_id = uuid.uuid4()

    software = MagicMock(spec=Software)
    software.id = sw_id
    software.studio_id = studio_id

    user = MagicMock()
    user.id = user_id
    user.is_tool_admin = False

    grant = MagicMock(spec=CrossStudioAccess)

    session = MagicMock()
    exec_calls: list[object] = []

    async def fake_execute(stmt: object) -> MagicMock:
        exec_calls.append(stmt)
        r = MagicMock()
        if len(exec_calls) == 1:
            r.scalar_one_or_none.return_value = None
        elif len(exec_calls) == 2:
            r.scalar_one_or_none.return_value = grant
        else:
            raise AssertionError(f"unexpected extra execute: {len(exec_calls)}")
        return r

    session.execute = AsyncMock(side_effect=fake_execute)
    session.get = AsyncMock(
        return_value=MagicMock()
    )  # studio row for resolve_studio_access

    await resolve_studio_access_for_software(session, user, software)

    assert len(exec_calls) == 2
