"""Projects under software."""

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import (
    ProjectAccess,
    SoftwareAccess,
    get_project_access_nested,
    get_software_access,
    require_project_home_editor_nested,
    require_project_studio_admin_nested,
    require_software_home_editor,
)
from app.schemas.project import (
    ProjectArchivePatch,
    ProjectCreate,
    ProjectResponse,
    ProjectUpdate,
)
from app.services.project_service import ProjectService

router = APIRouter(prefix="/software/{software_id}/projects", tags=["projects"])


@router.get("", response_model=list[ProjectResponse])
async def list_projects(
    software_id: UUID,
    include_archived: bool = False,
    session: AsyncSession = Depends(get_db),
    _sa: SoftwareAccess = Depends(get_software_access),
) -> list[ProjectResponse]:
    return await ProjectService(session).list_projects(
        software_id, include_archived=include_archived
    )


@router.post("", response_model=ProjectResponse)
async def create_project(
    software_id: UUID,
    body: ProjectCreate,
    session: AsyncSession = Depends(get_db),
    sa: SoftwareAccess = Depends(require_software_home_editor),
) -> ProjectResponse:
    return await ProjectService(session).create_project(
        software_id,
        body,
        actor_user_id=sa.studio_access.user.id,
    )


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    software_id: UUID,
    project_id: UUID,
    session: AsyncSession = Depends(get_db),
    _pa=Depends(get_project_access_nested),
) -> ProjectResponse:
    return await ProjectService(session).get_project(
        software_id, project_id, include_sections=True
    )


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    software_id: UUID,
    project_id: UUID,
    body: ProjectUpdate,
    session: AsyncSession = Depends(get_db),
    _pa=Depends(require_project_studio_admin_nested),
) -> ProjectResponse:
    return await ProjectService(session).update_project(
        software_id, project_id, body
    )


@router.patch("/{project_id}", response_model=ProjectResponse)
async def patch_project_archived(
    software_id: UUID,
    project_id: UUID,
    body: ProjectArchivePatch,
    session: AsyncSession = Depends(get_db),
    _pa: ProjectAccess = Depends(require_project_home_editor_nested),
) -> ProjectResponse:
    return await ProjectService(session).patch_project_archived(
        software_id,
        project_id,
        archived=body.archived,
        actor_user_id=_pa.studio_access.user.id,
    )


@router.delete("/{project_id}", status_code=204)
async def delete_project(
    software_id: UUID,
    project_id: UUID,
    session: AsyncSession = Depends(get_db),
    _pa=Depends(require_project_studio_admin_nested),
) -> Response:
    await ProjectService(session).delete_project(software_id, project_id)
    return Response(status_code=204)
