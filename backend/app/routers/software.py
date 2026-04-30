"""Software routes under a studio."""

from uuid import UUID

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import StudioAccess, get_studio_access, require_studio_admin, require_studio_editor
from app.schemas.publish import GitCommitItem, GitHistoryResponse
from app.schemas.software import GitTestResult, SoftwareCreate, SoftwareResponse, SoftwareUpdate
from app.services.software_service import SoftwareService

router = APIRouter(prefix="/studios/{studio_id}/software", tags=["software"])


@router.get("", response_model=list[SoftwareResponse])
async def list_software(
    session: AsyncSession = Depends(get_db),
    access: StudioAccess = Depends(get_studio_access),
) -> list[SoftwareResponse]:
    return await SoftwareService(session).list_software(access)


@router.post("", response_model=SoftwareResponse)
async def create_software(
    body: SoftwareCreate,
    session: AsyncSession = Depends(get_db),
    access: StudioAccess = Depends(require_studio_admin),
) -> SoftwareResponse:
    return await SoftwareService(session).create_software(access, body)


@router.get("/{software_id}", response_model=SoftwareResponse)
async def get_software(
    software_id: UUID,
    session: AsyncSession = Depends(get_db),
    access: StudioAccess = Depends(get_studio_access),
) -> SoftwareResponse:
    return await SoftwareService(session).get_software(access, software_id)


@router.put("/{software_id}", response_model=SoftwareResponse)
async def update_software(
    software_id: UUID,
    body: SoftwareUpdate,
    session: AsyncSession = Depends(get_db),
    access: StudioAccess = Depends(require_studio_editor),
) -> SoftwareResponse:
    return await SoftwareService(session).update_software(access, software_id, body)


@router.patch("/{software_id}", response_model=SoftwareResponse)
async def patch_software(
    software_id: UUID,
    body: SoftwareUpdate,
    session: AsyncSession = Depends(get_db),
    access: StudioAccess = Depends(require_studio_editor),
) -> SoftwareResponse:
    return await SoftwareService(session).update_software(access, software_id, body)


@router.delete("/{software_id}", status_code=204)
async def delete_software(
    software_id: UUID,
    session: AsyncSession = Depends(get_db),
    access: StudioAccess = Depends(require_studio_admin),
) -> Response:
    await SoftwareService(session).delete_software(access, software_id)
    return Response(status_code=204)


@router.get("/{software_id}/history", response_model=GitHistoryResponse)
async def software_git_history(
    software_id: UUID,
    session: AsyncSession = Depends(get_db),
    access: StudioAccess = Depends(get_studio_access),
) -> GitHistoryResponse:
    rows = await SoftwareService(session).git_commit_history(
        access, software_id, per_page=30
    )
    return GitHistoryResponse(
        commits=[GitCommitItem.model_validate(r) for r in rows],
    )


@router.post("/{software_id}/git/test", response_model=GitTestResult)
async def test_git_connection(
    software_id: UUID,
    session: AsyncSession = Depends(get_db),
    access: StudioAccess = Depends(require_studio_admin),
) -> GitTestResult:
    return await SoftwareService(session).test_git(access, software_id)
