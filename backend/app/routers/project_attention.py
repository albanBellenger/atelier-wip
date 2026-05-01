"""Project attention aggregate (builder home)."""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import ProjectAccess, require_project_issues_readable
from app.exceptions import ApiError
from app.schemas.attention import AttentionListOut
from app.services.attention_service import AttentionService

router = APIRouter(prefix="/projects/{project_id}", tags=["attention"])


def _ensure_project(pa: ProjectAccess, project_id: UUID) -> None:
    if pa.project.id != project_id:
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message="Project not found.",
        )


@router.get("/attention", response_model=AttentionListOut)
async def list_project_attention(
    project_id: UUID,
    session: AsyncSession = Depends(get_db),
    pa: ProjectAccess = Depends(require_project_issues_readable),
) -> AttentionListOut:
    _ensure_project(pa, project_id)
    if not pa.studio_access.is_studio_member:
        raise ApiError(
            status_code=403,
            code="FORBIDDEN",
            message="Not a member of this studio.",
        )
    return await AttentionService(session).list_project_attention(
        project_id=project_id,
        user_id=pa.studio_access.user.id,
        is_studio_admin=pa.studio_access.is_studio_admin,
    )
