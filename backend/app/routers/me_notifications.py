"""Routes under ``/me/notifications``."""

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas.notification import (
    MarkAllReadOut,
    NotificationListOut,
    NotificationOut,
    NotificationReadPatch,
)
from app.services.notification_service import NotificationService

router = APIRouter(tags=["me"])


@router.get("/me/notifications", response_model=NotificationListOut)
async def list_my_notifications(
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    limit: int = Query(50, ge=1, le=100),
    cursor: str | None = Query(None),
) -> NotificationListOut:
    return await NotificationService(session).list_for_user(
        user.id, limit=limit, cursor=cursor
    )


@router.patch(
    "/me/notifications/{notification_id}",
    response_model=NotificationOut,
)
async def patch_my_notification(
    notification_id: UUID,
    body: NotificationReadPatch,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> NotificationOut:
    return await NotificationService(session).mark_read(
        user.id, notification_id, read=body.read
    )


@router.post(
    "/me/notifications/mark-all-read",
    response_model=MarkAllReadOut,
)
async def mark_all_my_notifications_read(
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MarkAllReadOut:
    n = await NotificationService(session).mark_all_read(user.id)
    return MarkAllReadOut(updated=n)
