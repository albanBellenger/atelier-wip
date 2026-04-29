"""Sections under a project."""

from uuid import UUID

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_project_access, require_project_studio_admin
from app.schemas.section import SectionCreate, SectionResponse, SectionUpdate
from app.services.section_service import SectionService

router = APIRouter(prefix="/projects/{project_id}/sections", tags=["sections"])


@router.get("", response_model=list[SectionResponse])
async def list_sections(
    project_id: UUID,
    session: AsyncSession = Depends(get_db),
    _pa=Depends(get_project_access),
) -> list[SectionResponse]:
    return await SectionService(session).list_sections(project_id)


@router.post("", response_model=SectionResponse)
async def create_section(
    project_id: UUID,
    body: SectionCreate,
    session: AsyncSession = Depends(get_db),
    _pa=Depends(require_project_studio_admin),
) -> SectionResponse:
    return await SectionService(session).create_section(project_id, body)


@router.get("/{section_id}", response_model=SectionResponse)
async def get_section(
    project_id: UUID,
    section_id: UUID,
    session: AsyncSession = Depends(get_db),
    _pa=Depends(get_project_access),
) -> SectionResponse:
    return await SectionService(session).get_section(project_id, section_id)


@router.patch("/{section_id}", response_model=SectionResponse)
async def update_section(
    project_id: UUID,
    section_id: UUID,
    body: SectionUpdate,
    session: AsyncSession = Depends(get_db),
    pa=Depends(get_project_access),
) -> SectionResponse:
    return await SectionService(session).update_section(
        project_id,
        section_id,
        body,
        is_studio_admin=pa.studio_access.is_studio_admin,
    )


@router.delete("/{section_id}", status_code=204)
async def delete_section(
    project_id: UUID,
    section_id: UUID,
    session: AsyncSession = Depends(get_db),
    _pa=Depends(require_project_studio_admin),
) -> Response:
    await SectionService(session).delete_section(project_id, section_id)
    return Response(status_code=204)
