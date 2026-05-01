"""List and update in-app notifications for the current user."""

from __future__ import annotations

import base64
import binascii
import json
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import and_, desc, select, tuple_, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ApiError
from app.models.notification import Notification
from app.schemas.notification import NotificationListOut, NotificationOut


def encode_notification_cursor(created_at: datetime, notification_id: uuid.UUID) -> str:
    payload = {
        "c": created_at.isoformat(),
        "i": str(notification_id),
    }
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii")


def decode_notification_cursor(raw: str | None) -> tuple[datetime, uuid.UUID] | None:
    if raw is None or raw == "":
        return None
    try:
        data = base64.urlsafe_b64decode(raw.encode("ascii"))
        obj: Any = json.loads(data.decode("utf-8"))
    except (binascii.Error, ValueError, UnicodeDecodeError, json.JSONDecodeError):
        raise ApiError(
            status_code=422,
            code="VALIDATION_ERROR",
            message="Invalid cursor.",
        ) from None
    if not isinstance(obj, dict):
        raise ApiError(
            status_code=422,
            code="VALIDATION_ERROR",
            message="Invalid cursor.",
        )
    try:
        c_raw = obj["c"]
        i_raw = obj["i"]
        if not isinstance(c_raw, str) or not isinstance(i_raw, str):
            raise KeyError
        ts = datetime.fromisoformat(c_raw.replace("Z", "+00:00"))
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        nid = uuid.UUID(i_raw)
    except (KeyError, ValueError):
        raise ApiError(
            status_code=422,
            code="VALIDATION_ERROR",
            message="Invalid cursor.",
        ) from None
    return ts, nid


class NotificationService:
    """CRUD helpers for ``notifications`` scoped to a single user."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list_for_user(
        self,
        user_id: uuid.UUID,
        *,
        limit: int,
        cursor: str | None,
    ) -> NotificationListOut:
        if limit < 1 or limit > 100:
            raise ApiError(
                status_code=422,
                code="VALIDATION_ERROR",
                message="limit must be between 1 and 100.",
            )
        decoded = decode_notification_cursor(cursor)
        q = select(Notification).where(Notification.user_id == user_id)
        if decoded is not None:
            c_at, c_id = decoded
            q = q.where(
                tuple_(Notification.created_at, Notification.id)
                < tuple_(c_at, c_id)
            )
        q = q.order_by(desc(Notification.created_at), desc(Notification.id)).limit(
            limit + 1
        )
        result = await self.db.execute(q)
        rows = list(result.scalars().all())
        has_more = len(rows) > limit
        page = rows[:limit]
        items = [NotificationOut.model_validate(r) for r in page]
        next_cursor: str | None = None
        if has_more and page:
            last = page[-1]
            next_cursor = encode_notification_cursor(last.created_at, last.id)
        return NotificationListOut(items=items, next_cursor=next_cursor)

    async def mark_read(
        self, user_id: uuid.UUID, notification_id: uuid.UUID, read: bool
    ) -> NotificationOut:
        row = (
            await self.db.execute(
                select(Notification).where(
                    Notification.id == notification_id,
                    Notification.user_id == user_id,
                )
            )
        ).scalar_one_or_none()
        if row is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Notification not found.",
            )
        if read:
            row.read_at = datetime.now(timezone.utc)
        else:
            row.read_at = None
        await self.db.flush()
        return NotificationOut.model_validate(row)

    async def mark_all_read(self, user_id: uuid.UUID) -> int:
        now = datetime.now(timezone.utc)
        res = await self.db.execute(
            update(Notification)
            .where(
                and_(Notification.user_id == user_id, Notification.read_at.is_(None))
            )
            .values(read_at=now)
        )
        await self.db.flush()
        return int(res.rowcount or 0)
