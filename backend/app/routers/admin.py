"""Tool admin routes."""

from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import require_tool_admin
from app.models import User
from app.schemas.auth import (
    AdminConfigResponse,
    AdminConfigUpdate,
    AdminConnectivityResult,
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
    background_tasks: BackgroundTasks,
    body: AdminConfigUpdate,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
) -> AdminConfigResponse:
    return await AdminService(session).update(body, background_tasks)


@router.post("/test/llm", response_model=AdminConnectivityResult)
async def test_admin_llm(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
) -> AdminConnectivityResult:
    return await AdminService(session).test_llm()


@router.post("/test/embedding", response_model=AdminConnectivityResult)
async def test_admin_embedding(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
) -> AdminConnectivityResult:
    return await AdminService(session).test_embedding()


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
