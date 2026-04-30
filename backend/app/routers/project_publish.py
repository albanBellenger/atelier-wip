"""POST /projects/{project_id}/publish"""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import ProjectAccess, require_can_publish
from app.exceptions import ApiError
from app.schemas.publish import PublishRequest, PublishResponse
from app.services.publish_service import PublishService

router = APIRouter(prefix="/projects/{project_id}", tags=["publish"])


def _ensure_project(pa: ProjectAccess, project_id: UUID) -> None:
    if pa.project.id != project_id:
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message="Project not found.",
        )


@router.post("/publish", response_model=PublishResponse)
async def publish_project(
    project_id: UUID,
    body: PublishRequest | None = None,
    session: AsyncSession = Depends(get_db),
    pa: ProjectAccess = Depends(require_can_publish),
) -> PublishResponse:
    _ensure_project(pa, project_id)
    msg = body.commit_message if body else None
    result = await PublishService(session).publish(access=pa, commit_message=msg)
    return PublishResponse(
        commit_url=result.commit_url,
        commit_sha=result.commit_sha,
        files_committed=result.files_committed,
    )
