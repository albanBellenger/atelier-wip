"""Pytest configuration — set env before importing the app."""

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


@pytest.fixture(autouse=True)
def _reset_slowapi_limiter() -> None:
    """Isolate rate-limit counters between tests (shared in-memory storage)."""
    from app.main import limiter

    limiter.reset()


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


@pytest.fixture(scope="session")
def _alembic_upgrade_once() -> None:
    """Apply migrations once per test session (sync; runs on main thread)."""
    _db_url = os.environ["TEST_DATABASE_URL"]
    assert "test" in _db_url or ":5433" in _db_url, (
        "Safety check failed: TEST_DATABASE_URL does not look like a test database.\n"
        "    Refusing to run destructive migrations."
    )
    _run_alembic_upgrade_head()


@pytest_asyncio.fixture(loop_scope="function")
async def db_engine(_alembic_upgrade_once: None) -> AsyncEngine:
    """Per-test async engine on the same asyncio loop as the test (avoids asyncpg loop mismatch)."""
    _db_url = os.environ["TEST_DATABASE_URL"]
    engine = create_async_engine(_db_url, echo=False, pool_pre_ping=True)
    try:
        yield engine
    finally:
        await engine.dispose()


@pytest_asyncio.fixture
async def client(db_engine: AsyncEngine) -> AsyncClient:
    """ASGI client with ``get_db`` overridden to an isolated session per test.

    The DB session is nested *inside* ``AsyncClient`` so the transaction is rolled
    back before app shutdown runs ``engine.dispose()`` on the global pool.
    """
    from app.database import get_db
    from app.main import app  # noqa: WPS433

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        async with db_engine.connect() as conn:
            trans = await conn.begin()
            await conn.begin_nested()
            session = AsyncSession(bind=conn, expire_on_commit=False)

            async def override_get_db():
                yield session

            app.dependency_overrides[get_db] = override_get_db
            try:
                yield ac
            finally:
                app.dependency_overrides.pop(get_db, None)
                await session.close()
                await trans.rollback()
