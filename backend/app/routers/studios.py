"""Studio routes."""

from uuid import UUID

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import (
    StudioAccess,
    get_current_user,
    get_studio_access,
    require_studio_admin,
)
from app.models import User
from app.schemas.studio import (
    MemberInvite,
    MemberRoleUpdate,
    StudioCreate,
    StudioMemberResponse,
    StudioResponse,
    StudioUpdate,
)
from app.services.studio_service import StudioService

router = APIRouter(prefix="/studios", tags=["studios"])


@router.get("", response_model=list[StudioResponse])
async def list_studios(
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[StudioResponse]:
    return await StudioService(session).list_studios(user)


@router.post("", response_model=StudioResponse)
async def create_studio(
    body: StudioCreate,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> StudioResponse:
    return await StudioService(session).create_studio(user, body)


@router.get("/{studio_id}", response_model=StudioResponse)
async def get_studio(
    session: AsyncSession = Depends(get_db),
    access: StudioAccess = Depends(get_studio_access),
) -> StudioResponse:
    return await StudioService(session).get_studio(access)


@router.patch("/{studio_id}", response_model=StudioResponse)
async def update_studio(
    body: StudioUpdate,
    session: AsyncSession = Depends(get_db),
    access: StudioAccess = Depends(require_studio_admin),
) -> StudioResponse:
    return await StudioService(session).update_studio(access, body)


@router.delete("/{studio_id}", status_code=204)
async def delete_studio(
    session: AsyncSession = Depends(get_db),
    access: StudioAccess = Depends(require_studio_admin),
) -> Response:
    await StudioService(session).delete_studio(access)
    return Response(status_code=204)


@router.get("/{studio_id}/members", response_model=list[StudioMemberResponse])
async def list_members(
    session: AsyncSession = Depends(get_db),
    access: StudioAccess = Depends(get_studio_access),
) -> list[StudioMemberResponse]:
    return await StudioService(session).list_members(access)


@router.post("/{studio_id}/members", response_model=StudioMemberResponse)
async def add_member(
    body: MemberInvite,
    session: AsyncSession = Depends(get_db),
    access: StudioAccess = Depends(require_studio_admin),
) -> StudioMemberResponse:
    return await StudioService(session).add_member(access, body)


@router.delete("/{studio_id}/members/{user_id}", status_code=204)
async def remove_member(
    user_id: UUID,
    session: AsyncSession = Depends(get_db),
    access: StudioAccess = Depends(require_studio_admin),
) -> Response:
    await StudioService(session).remove_member(access, user_id)
    return Response(status_code=204)


@router.patch("/{studio_id}/members/{user_id}", response_model=StudioMemberResponse)
async def update_member_role(
    user_id: UUID,
    body: MemberRoleUpdate,
    session: AsyncSession = Depends(get_db),
    access: StudioAccess = Depends(require_studio_admin),
) -> StudioMemberResponse:
    return await StudioService(session).update_member_role(access, user_id, body)
