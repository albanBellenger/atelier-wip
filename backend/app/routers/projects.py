"""Projects under software."""

from uuid import UUID

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import (
    SoftwareAccess,
    get_project_access_nested,
    get_software_access,
    require_project_studio_admin_nested,
)
from app.schemas.project import ProjectCreate, ProjectResponse, ProjectUpdate
from app.services.project_service import ProjectService

router = APIRouter(prefix="/software/{software_id}/projects", tags=["projects"])


@router.get("", response_model=list[ProjectResponse])
async def list_projects(
    software_id: UUID,
    session: AsyncSession = Depends(get_db),
    _sa: SoftwareAccess = Depends(get_software_access),
) -> list[ProjectResponse]:
    return await ProjectService(session).list_projects(software_id)


@router.post("", response_model=ProjectResponse)
async def create_project(
    software_id: UUID,
    body: ProjectCreate,
    session: AsyncSession = Depends(get_db),
    _sa: SoftwareAccess = Depends(get_software_access),
) -> ProjectResponse:
    return await ProjectService(session).create_project(software_id, body)


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


@router.patch("/{project_id}", response_model=ProjectResponse)
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


@router.delete("/{project_id}", status_code=204)
async def delete_project(
    software_id: UUID,
    project_id: UUID,
    session: AsyncSession = Depends(get_db),
    _pa=Depends(require_project_studio_admin_nested),
) -> Response:
    await ProjectService(session).delete_project(software_id, project_id)
    return Response(status_code=204)
