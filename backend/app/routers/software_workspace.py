"""Read-only aggregates for a software (dashboard)."""

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import SoftwareAccess, get_current_user, get_software_access
from app.exceptions import ApiError
from app.models.user import User
from app.schemas.artifact import SoftwareArtifactRowOut
from app.schemas.attention import SoftwareAttentionListOut
from app.schemas.software_activity import SoftwareActivityListOut
from app.services.attention_service import AttentionService
from app.services.artifact_service import ArtifactService
from app.services.software_activity_service import SoftwareActivityService

router = APIRouter(prefix="/software/{software_id}", tags=["software-workspace"])


@router.get("/attention", response_model=SoftwareAttentionListOut)
async def list_software_attention(
    software_id: UUID,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    sa: SoftwareAccess = Depends(get_software_access),
) -> SoftwareAttentionListOut:
    if sa.studio_access.is_cross_studio_viewer:
        raise ApiError(
            status_code=403,
            code="FORBIDDEN",
            message="Attention feed is not available for cross-studio viewers.",
        )
    if not sa.studio_access.is_studio_member:
        raise ApiError(
            status_code=403,
            code="FORBIDDEN",
            message="Studio membership required.",
        )
    return await AttentionService(session).list_software_attention(
        software_id=software_id,
        user_id=user.id,
        is_studio_admin=sa.studio_access.is_studio_admin,
    )


@router.get("/activity", response_model=SoftwareActivityListOut)
async def list_software_activity(
    software_id: UUID,
    limit: int = Query(30, ge=1, le=100),
    session: AsyncSession = Depends(get_db),
    sa: SoftwareAccess = Depends(get_software_access),
) -> SoftwareActivityListOut:
    if not sa.studio_access.can_create_project:
        raise ApiError(
            status_code=403,
            code="FORBIDDEN",
            message="Owning studio membership required.",
        )
    if not sa.studio_access.is_studio_editor:
        raise ApiError(
            status_code=403,
            code="FORBIDDEN",
            message="Studio membership required.",
        )
    items = await SoftwareActivityService(session).list_activity_items_out(
        software_id, limit=limit
    )
    return SoftwareActivityListOut(items=items)


@router.get("/artifacts", response_model=list[SoftwareArtifactRowOut])
async def list_software_artifacts(
    software_id: UUID,
    for_project_id: UUID | None = Query(None, description="Scope project exclusions to this project"),
    session: AsyncSession = Depends(get_db),
    _sa: SoftwareAccess = Depends(get_software_access),
) -> list[SoftwareArtifactRowOut]:
    return await ArtifactService(session).list_artifacts_for_software(
        software_id,
        for_project_id=for_project_id,
    )
