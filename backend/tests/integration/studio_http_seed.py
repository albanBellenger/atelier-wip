"""Seed studios over HTTP for integration tests (platform-admin-only create)."""

from __future__ import annotations

import os

from httpx import AsyncClient, Response
from sqlalchemy import create_engine, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User


async def promote_platform_admin(
    db_session: AsyncSession, email: str
) -> None:
    r = await db_session.execute(
        select(User).where(User.email == email.lower().strip())
    )
    u = r.scalar_one()
    u.is_platform_admin = True
    await db_session.flush()


def promote_platform_admin_sync(email: str) -> None:
    """For ``TestClient`` blocks that do not share the pytest ``db_session`` override."""
    raw = os.environ.get("TEST_DATABASE_URL") or os.environ["DATABASE_URL"]
    if "+asyncpg" in raw:
        sync_url = raw.replace("+asyncpg", "+psycopg", 1)
    else:
        sync_url = raw
    engine = create_engine(sync_url)
    with engine.begin() as conn:
        conn.execute(
            update(User)
            .where(User.email == email.lower().strip())
            .values(is_platform_admin=True)
        )
    engine.dispose()


async def post_admin_studio(
    client: AsyncClient,
    db_session: AsyncSession,
    *,
    user_email: str,
    json_body: dict,
    retain_platform_admin: bool = False,
) -> Response:
    """Promote the user so ``POST /admin/studios`` succeeds, then demote by default.

    Temporary promotion is only for the admin create call; leaving ``is_platform_admin``
    true would widen RBAC in unrelated assertions. Set ``retain_platform_admin=True``
    when the test intentionally needs the user to stay a platform admin afterward.
    """
    await promote_platform_admin(db_session, user_email)
    resp = await client.post("/admin/studios", json=json_body)
    if resp.is_success and not retain_platform_admin:
        # Registration seeds the first account as platform admin; promotion for POST
        # may touch a different email than the cookie user. Clear PA on everyone so
        # studio RBAC tests do not accidentally run as infrastructure admin.
        await db_session.execute(update(User).values(is_platform_admin=False))
        await db_session.flush()
    return resp
