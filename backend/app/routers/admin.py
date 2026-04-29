"""Tool admin routes."""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import require_tool_admin
from app.models import User
from app.schemas.auth import (
    AdminConfigResponse,
    AdminConfigUpdate,
    AdminStatusUpdate,
    UserPublic,
)
from app.services.admin_service import AdminService

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/config", response_model=AdminConfigResponse)
async def get_admin_config(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
) -> AdminConfigResponse:
    return await AdminService(session).get_public()


@router.put("/config", response_model=AdminConfigResponse)
async def put_admin_config(
    body: AdminConfigUpdate,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
) -> AdminConfigResponse:
    return await AdminService(session).update(body)


@router.put("/users/{user_id}/admin-status", response_model=UserPublic)
async def set_user_admin_status(
    user_id: UUID,
    body: AdminStatusUpdate,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_tool_admin),
) -> UserPublic:
    return await AdminService(session).set_admin_status(
        user_id, body.is_tool_admin, current_user
    )
