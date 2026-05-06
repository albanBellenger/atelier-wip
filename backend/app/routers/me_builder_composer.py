"""Builder home composer hint (structured LLM)."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import fetch_software_access, get_current_user
from app.exceptions import ApiError
from app.models import Project, User
from app.schemas.builder_composer import (
    BuilderComposerHintBody,
    BuilderComposerHintResponse,
)
from app.services.builder_composer_service import BuilderComposerService

router = APIRouter(tags=["me"])


@router.post("/me/builder-composer-hint", response_model=BuilderComposerHintResponse)
async def post_builder_composer_hint(
    body: BuilderComposerHintBody,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> BuilderComposerHintResponse:
    sa = await fetch_software_access(session, user, body.software_id)
    if not sa.studio_access.is_studio_member:
        raise ApiError(
            status_code=403,
            code="FORBIDDEN",
            message="Membership in this studio is required.",
        )
    project: Project | None = None
    if body.project_id is not None:
        proj = await session.get(Project, body.project_id)
        if proj is None or proj.software_id != body.software_id:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Project not found for this software.",
            )
        project = proj

    return await BuilderComposerService(session).hint_for_software(
        user=user,
        software=sa.software,
        project=project,
        local_hour=body.local_hour,
    )
