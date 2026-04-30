"""MCP API key authentication (Slice 12)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

import bcrypt
from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.exceptions import ApiError
from app.models import McpKey


@dataclass(frozen=True, slots=True)
class McpAuth:
    key_row_id: uuid.UUID
    studio_id: uuid.UUID
    access_level: str


def _extract_raw_key(request: Request) -> str:
    auth = request.headers.get("authorization") or ""
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return (request.headers.get("x-api-key") or "").strip()


async def require_mcp_api_key(
    request: Request,
    session: AsyncSession = Depends(get_db),
) -> McpAuth:
    raw = _extract_raw_key(request)
    if not raw:
        raise ApiError(
            status_code=401,
            code="UNAUTHORIZED",
            message="MCP API key required",
        )
    raw_b = raw.encode("utf-8")
    rows = (
        (
            await session.execute(
                select(McpKey).where(McpKey.revoked_at.is_(None))
            )
        )
        .scalars()
        .all()
    )
    for row in rows:
        try:
            h = row.key_hash.encode("utf-8")
            if bcrypt.checkpw(raw_b, h):
                from datetime import datetime, timezone

                row.last_used_at = datetime.now(timezone.utc)
                await session.flush()
                return McpAuth(
                    key_row_id=row.id,
                    studio_id=row.studio_id,
                    access_level=(row.access_level or "editor").lower(),
                )
        except ValueError:
            continue
    raise ApiError(
        status_code=401,
        code="INVALID_API_KEY",
        message="Invalid or revoked MCP API key",
    )


def require_mcp_editor(auth: McpAuth = Depends(require_mcp_api_key)) -> McpAuth:
    if auth.access_level != "editor":
        raise ApiError(
            status_code=403,
            code="FORBIDDEN",
            message="Editor MCP key required for this operation",
        )
    return auth
