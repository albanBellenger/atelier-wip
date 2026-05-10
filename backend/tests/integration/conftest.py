"""Fixtures for integration tests only (not loaded for ``tests/unit``)."""

from __future__ import annotations

import uuid as uuid_mod

import pytest
import pytest_asyncio
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.security.passwords import hash_password


@pytest_asyncio.fixture(autouse=True)
async def _pytest_register_placeholder_user(
    db_session: AsyncSession,
    request: pytest.FixtureRequest,
) -> None:
    """Ensure ``users`` is non-empty so ``AuthService.register`` does not promote every first signup.

    ``test_auth.py`` asserts bootstrap semantics via TRUNCATE and must start empty, so skip
    seeding for that module only.
    """
    if request.node.fspath.basename == "test_auth.py":
        yield
        return

    n = await db_session.scalar(select(func.count()).select_from(User)) or 0
    if n == 0:
        db_session.add(
            User(
                id=uuid_mod.uuid4(),
                email="pytest.register-semantics.placeholder@example.invalid",
                password_hash=hash_password("unused-placeholder-secret-not-for-login"),
                display_name="pytest bootstrap",
                is_platform_admin=False,
            )
        )
        await db_session.flush()
    yield
