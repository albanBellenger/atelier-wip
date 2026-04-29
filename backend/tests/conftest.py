"""Pytest configuration — set env before importing the app."""

import os
import subprocess
import sys
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

os.environ["JWT_SECRET"] = "test-jwt-secret-key-not-for-production-use-32b!"
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://atelier:atelier@127.0.0.1:5432/atelier",
)

_BACKEND_ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="session", autouse=True)
def reset_database_schema() -> None:
    """Destructive: drop all tables via Alembic and re-apply migrations before tests."""
    sync_url = os.environ["DATABASE_URL"].replace("+asyncpg", "+psycopg", 1)
    env = {**os.environ, "DATABASE_URL": sync_url}
    subprocess.run(
        [sys.executable, "-m", "alembic", "downgrade", "base"],
        cwd=_BACKEND_ROOT,
        env=env,
        capture_output=True,
    )
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=_BACKEND_ROOT,
        env=env,
        check=True,
    )


@pytest_asyncio.fixture
async def client() -> AsyncClient:
    from app.main import app  # noqa: WPS433

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
