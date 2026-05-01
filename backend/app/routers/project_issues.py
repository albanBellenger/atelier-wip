"""Project issues + manual conflict analysis."""

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import (
    ProjectAccess,
    require_project_issues_readable,
    require_project_member,
)
from app.exceptions import ApiError
from app.models import Issue
from app.schemas.issues import AnalyzeResponse, IssueResponse, IssueUpdateBody
from app.services.conflict_service import ConflictService

router = APIRouter(prefix="/projects/{project_id}", tags=["issues"])


def _ensure_project(pa: ProjectAccess, project_id: UUID) -> None:
    if pa.project.id != project_id:
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message="Project not found.",
        )


@router.get("/issues", response_model=list[IssueResponse])
async def list_project_issues(
    project_id: UUID,
    session: AsyncSession = Depends(get_db),
    pa: ProjectAccess = Depends(require_project_issues_readable),
    section_id: UUID | None = Query(
        None,
        description="When set, only issues touching this section (section_a or section_b).",
    ),
) -> list[IssueResponse]:
    _ensure_project(pa, project_id)
    if not pa.studio_access.is_studio_member:
        raise ApiError(
            status_code=403,
            code="FORBIDDEN",
            message="Not a member of this studio.",
        )
    stmt = select(Issue).where(Issue.project_id == project_id)
    if section_id is not None:
        stmt = stmt.where(
            or_(Issue.section_a_id == section_id, Issue.section_b_id == section_id)
        )
    if not pa.studio_access.is_studio_admin:
        uid = pa.studio_access.user.id
        stmt = stmt.where(
            or_(Issue.run_actor_id == uid, Issue.triggered_by == uid),
        )
    stmt = stmt.order_by(Issue.created_at.desc())
    rows = list((await session.execute(stmt)).scalars().all())
    return [IssueResponse.model_validate(r) for r in rows]


@router.put("/issues/{issue_id}", response_model=IssueResponse)
async def update_issue(
    project_id: UUID,
    issue_id: UUID,
    body: IssueUpdateBody,
    session: AsyncSession = Depends(get_db),
    pa: ProjectAccess = Depends(require_project_member),
) -> IssueResponse:
    _ensure_project(pa, project_id)
    row = await session.get(Issue, issue_id)
    if row is None or row.project_id != project_id:
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message="Issue not found.",
        )
    uid = pa.studio_access.user.id
    if not pa.studio_access.is_studio_admin:
        vis = row.run_actor_id == uid or row.triggered_by == uid
        if not vis:
            raise ApiError(
                status_code=403,
                code="FORBIDDEN",
                message="You cannot update this issue.",
            )
    row.status = body.status
    await session.commit()
    await session.refresh(row)
    return IssueResponse.model_validate(row)


@router.post("/analyze", response_model=AnalyzeResponse)
async def run_manual_conflict_analysis(
    project_id: UUID,
    session: AsyncSession = Depends(get_db),
    pa: ProjectAccess = Depends(require_project_member),
) -> AnalyzeResponse:
    _ensure_project(pa, project_id)
    n = await ConflictService(session).run_conflict_analysis(
        project_id=project_id,
        run_actor_id=pa.studio_access.user.id,
        origin="manual",
    )
    await session.commit()
    return AnalyzeResponse(issues_created=n)
