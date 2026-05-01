"""Unit tests for AuthService.patch_profile."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.exceptions import ApiError
from app.models import User
from app.schemas.auth import UserProfilePatch
from app.services.auth_service import AuthService


@pytest.mark.asyncio
async def test_patch_profile_strips_display_name() -> None:
    db = MagicMock()
    db.flush = AsyncMock()
    db_user = MagicMock(spec=User)
    db_user.id = uuid.uuid4()
    db_user.display_name = "Old"
    exec_result = MagicMock()
    exec_result.scalar_one.return_value = db_user
    db.execute = AsyncMock(return_value=exec_result)
    body = UserProfilePatch(display_name="  Mara Caron  ")
    svc = AuthService(db)
    with patch.object(svc, "me", new_callable=AsyncMock) as m_me:
        m_me.return_value = MagicMock()
        await svc.patch_profile(db_user, body)
    assert db_user.display_name == "Mara Caron"
    db.flush.assert_awaited_once()
    m_me.assert_awaited_once()


@pytest.mark.asyncio
async def test_patch_profile_whitespace_only_raises() -> None:
    db = MagicMock()
    db.flush = AsyncMock()
    db_user = MagicMock(spec=User)
    exec_result = MagicMock()
    exec_result.scalar_one.return_value = db_user
    db.execute = AsyncMock(return_value=exec_result)
    body = UserProfilePatch(display_name="    ")
    svc = AuthService(db)
    with pytest.raises(ApiError) as ei:
        await svc.patch_profile(db_user, body)
    assert ei.value.status_code == 422
