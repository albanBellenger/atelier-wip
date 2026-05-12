"""Software documentation sections (Markdown under Software, not tied to a Project)."""

from uuid import UUID

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import (
    SoftwareAccess,
    get_software_access,
    require_software_admin,
    require_software_home_editor,
    require_software_member,
)
from app.schemas.section import SectionCreate, SectionReorder, SectionResponse, SectionUpdate
from app.schemas.software_docs_backprop import (
    BackpropOutlineProposalResponse,
    BackpropOutlineRequest,
    BackpropSectionProposalResponse,
)
from app.services.codebase_service import CodebaseService
from app.services.software_docs_section_service import SoftwareDocsSectionService

router = APIRouter(
    prefix="/software/{software_id}/docs",
    tags=["software-docs"],
)


@router.get("", response_model=list[SectionResponse])
async def list_software_docs_sections(
    software_id: UUID,
    session: AsyncSession = Depends(get_db),
    _sa: SoftwareAccess = Depends(get_software_access),
) -> list[SectionResponse]:
    return await SoftwareDocsSectionService(session).list_sections(software_id)


@router.post("", response_model=SectionResponse)
async def create_software_docs_section(
    software_id: UUID,
    body: SectionCreate,
    session: AsyncSession = Depends(get_db),
    sa: SoftwareAccess = Depends(require_software_admin),
) -> SectionResponse:
    return await SoftwareDocsSectionService(session).create_section(
        software_id,
        body,
        actor_user_id=sa.studio_access.user.id,
        studio_id=sa.software.studio_id,
    )


@router.post("/reorder", response_model=list[SectionResponse])
async def reorder_software_docs_sections(
    software_id: UUID,
    body: SectionReorder,
    session: AsyncSession = Depends(get_db),
    sa: SoftwareAccess = Depends(require_software_admin),
) -> list[SectionResponse]:
    return await SoftwareDocsSectionService(session).reorder_sections(
        software_id,
        body.section_ids,
        actor_user_id=sa.studio_access.user.id,
        studio_id=sa.software.studio_id,
    )


@router.post("/propose-outline", response_model=BackpropOutlineProposalResponse)
async def propose_software_docs_outline(
    software_id: UUID,
    body: BackpropOutlineRequest,
    session: AsyncSession = Depends(get_db),
    sa: SoftwareAccess = Depends(require_software_home_editor),
) -> BackpropOutlineProposalResponse:
    raw = await CodebaseService(session).propose_software_docs_outline(
        software_id,
        body.hint,
        actor_user_id=sa.studio_access.user.id,
    )
    return BackpropOutlineProposalResponse.model_validate(raw)


@router.get("/{section_id}", response_model=SectionResponse)
async def get_software_docs_section(
    software_id: UUID,
    section_id: UUID,
    session: AsyncSession = Depends(get_db),
    _sa: SoftwareAccess = Depends(get_software_access),
) -> SectionResponse:
    return await SoftwareDocsSectionService(session).get_section(
        software_id, section_id
    )


@router.post(
    "/{section_id}/propose-draft",
    response_model=BackpropSectionProposalResponse,
)
async def propose_software_doc_section_draft(
    software_id: UUID,
    section_id: UUID,
    session: AsyncSession = Depends(get_db),
    sa: SoftwareAccess = Depends(require_software_home_editor),
) -> BackpropSectionProposalResponse:
    raw = await CodebaseService(session).propose_software_doc_section_draft(
        software_id,
        section_id,
        actor_user_id=sa.studio_access.user.id,
    )
    return BackpropSectionProposalResponse.model_validate(raw)


@router.patch("/{section_id}", response_model=SectionResponse)
async def update_software_docs_section(
    software_id: UUID,
    section_id: UUID,
    body: SectionUpdate,
    session: AsyncSession = Depends(get_db),
    sa: SoftwareAccess = Depends(require_software_member),
) -> SectionResponse:
    return await SoftwareDocsSectionService(session).update_section(
        software_id,
        section_id,
        body,
        is_studio_admin=sa.studio_access.is_studio_admin,
        actor_user_id=sa.studio_access.user.id,
        studio_id=sa.software.studio_id,
    )


@router.delete("/{section_id}", status_code=204)
async def delete_software_docs_section(
    software_id: UUID,
    section_id: UUID,
    session: AsyncSession = Depends(get_db),
    sa: SoftwareAccess = Depends(require_software_admin),
) -> Response:
    await SoftwareDocsSectionService(session).delete_section(
        software_id,
        section_id,
        actor_user_id=sa.studio_access.user.id,
        studio_id=sa.software.studio_id,
    )
    return Response(status_code=204)
