"""Pytest configuration — set env before importing the app."""

import asyncio
import os
from pathlib import Path

import pytest
import pytest_asyncio
from alembic import command
from alembic.config import Config
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine

os.environ["JWT_SECRET"] = "test-jwt-secret-key-not-for-production-use-32b!"
os.environ.setdefault(
    "ENCRYPTION_KEY",
    "I31jfQ9199nB85jcLQGtlaOsUCvhEyON2yN2IpM6d6Q=",
)
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://atelier_test:atelier_test@127.0.0.1:5433/atelier_test",
)
os.environ.setdefault("TEST_DATABASE_URL", os.environ["DATABASE_URL"])

from app.config import get_settings as _get_settings
from app.security.field_encryption import reset_fernet_cache

_get_settings.cache_clear()
reset_fernet_cache()

_BACKEND_ROOT = Path(__file__).resolve().parents[1]


def _run_alembic_upgrade_head() -> None:
    """Run Alembic migrations against TEST_DATABASE_URL (sync driver)."""
    test_url = os.environ["TEST_DATABASE_URL"]
    sync_url = test_url.replace("+asyncpg", "+psycopg", 1)
    cfg = Config(str(_BACKEND_ROOT / "alembic.ini"))
    previous = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = sync_url
    try:
        command.upgrade(cfg, "head")
    finally:
        if previous is not None:
            os.environ["DATABASE_URL"] = previous
        else:
            os.environ.pop("DATABASE_URL", None)


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def db_engine() -> AsyncEngine:
    """Session-scoped async engine; ``alembic upgrade head`` runs once."""
    _db_url = os.environ["TEST_DATABASE_URL"]
    assert "test" in _db_url or ":5433" in _db_url, (
        "Safety check failed: TEST_DATABASE_URL does not look like a test database.\n"
        "    Refusing to run destructive migrations."
    )
    await asyncio.to_thread(_run_alembic_upgrade_head)
    engine = create_async_engine(_db_url, echo=False, pool_pre_ping=True)
    try:
        yield engine
    finally:
        await engine.dispose()


@pytest_asyncio.fixture
async def db_session(db_engine: AsyncEngine) -> AsyncSession:
    """Per-test connection: outer transaction + savepoint, rolled back after the test."""
    async with db_engine.connect() as conn:
        trans = await conn.begin()
        await conn.begin_nested()
        session = AsyncSession(bind=conn, expire_on_commit=False)
        try:
            yield session
        finally:
            await session.close()
            await trans.rollback()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncClient:
    """ASGI client with ``get_db`` overridden to the isolated ``db_session``."""
    from app.database import get_db
    from app.main import app  # noqa: WPS433

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as ac:
            yield ac
    finally:
        app.dependency_overrides.pop(get_db, None)
