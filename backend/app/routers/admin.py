"""Tool admin routes."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import require_tool_admin
from app.models import User
from app.schemas.auth import AdminConfigPublic, AdminConfigUpdate
from app.services.admin_service import AdminService

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/config", response_model=AdminConfigPublic)
async def get_admin_config(
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
) -> AdminConfigPublic:
    return await AdminService.get_public(session)


@router.put("/config", response_model=AdminConfigPublic)
async def put_admin_config(
    body: AdminConfigUpdate,
    session: AsyncSession = Depends(get_db),
    _: User = Depends(require_tool_admin),
) -> AdminConfigPublic:
    return await AdminService.update(session, body)
