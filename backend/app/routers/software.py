"""Software routes under a studio."""

from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import (
    ProjectAccess,
    SoftwareAccess,
    StudioAccess,
    StudioSoftwareListAccess,
    get_project_access_nested,
    get_software_in_studio,
    get_studio_software_list_access,
    require_software_admin_in_studio,
    require_software_editor_in_studio,
    require_studio_admin,
)
from app.exceptions import ApiError
from app.schemas.artifact import (
    ArtifactExclusionPatch,
    ArtifactExclusionPatchResult,
)
from app.schemas.publish import GitCommitItem, GitHistoryResponse
from app.schemas.software import (
    GitTestResult,
    SoftwareCreate,
    SoftwareResponse,
    SoftwareTokenUsageSummaryOut,
    SoftwareUpdate,
)
from app.services.artifact_exclusion_service import ArtifactExclusionService
from app.services.software_service import SoftwareService
from app.services.token_usage_query_service import TokenUsageQueryService

router = APIRouter(prefix="/studios/{studio_id}/software", tags=["software"])


@router.get("", response_model=list[SoftwareResponse])
async def list_software(
    session: AsyncSession = Depends(get_db),
    list_access: StudioSoftwareListAccess = Depends(get_studio_software_list_access),
) -> list[SoftwareResponse]:
    return await SoftwareService(session).list_software(
        list_access.studio_access,
        allowed_software_ids=list_access.allowed_software_ids,
    )


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
    sa: SoftwareAccess = Depends(get_software_in_studio),
) -> SoftwareResponse:
    return await SoftwareService(session).get_software(sa.studio_access, software_id)


@router.put("/{software_id}", response_model=SoftwareResponse)
async def update_software(
    software_id: UUID,
    body: SoftwareUpdate,
    session: AsyncSession = Depends(get_db),
    sa: SoftwareAccess = Depends(require_software_editor_in_studio),
) -> SoftwareResponse:
    return await SoftwareService(session).update_software(
        sa.studio_access, software_id, body
    )


@router.patch("/{software_id}", response_model=SoftwareResponse)
async def patch_software(
    software_id: UUID,
    body: SoftwareUpdate,
    session: AsyncSession = Depends(get_db),
    sa: SoftwareAccess = Depends(require_software_editor_in_studio),
) -> SoftwareResponse:
    return await SoftwareService(session).update_software(
        sa.studio_access, software_id, body
    )


@router.delete("/{software_id}", status_code=204)
async def delete_software(
    software_id: UUID,
    session: AsyncSession = Depends(get_db),
    sa: SoftwareAccess = Depends(require_software_admin_in_studio),
) -> Response:
    await SoftwareService(session).delete_software(sa.studio_access, software_id)
    return Response(status_code=204)


@router.get("/{software_id}/token-usage/summary", response_model=SoftwareTokenUsageSummaryOut)
async def software_token_usage_summary(
    studio_id: UUID,
    software_id: UUID,
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    session: AsyncSession = Depends(get_db),
    sa: SoftwareAccess = Depends(get_software_in_studio),
) -> SoftwareTokenUsageSummaryOut:
    if not sa.studio_access.is_studio_member:
        raise ApiError(
            status_code=403,
            code="FORBIDDEN",
            message="Membership in this studio is required.",
        )
    today = datetime.now(timezone.utc).date()
    if date_from is None or date_to is None:
        period_start = date(today.year, today.month, 1)
        if today.month == 12:
            period_end = date(today.year, 12, 31)
        else:
            nxt = date(today.year, today.month + 1, 1)
            period_end = nxt - timedelta(days=1)
        date_from = date_from or period_start
        date_to = date_to or period_end

    svc = TokenUsageQueryService(session)
    cross = sa.studio_access.cross_studio_grant is not None
    if cross:
        tin, tout, cost = await svc.totals_for_filtered(
            scope="self",
            scope_studio_id=None,
            scope_user_id=sa.studio_access.user.id,
            studio_ids=None,
            software_ids=[software_id],
            project_ids=None,
            user_ids=None,
            call_types=None,
            work_order_ids=None,
            date_from=date_from,
            date_to=date_to,
        )
    else:
        tin, tout, cost = await svc.totals_for_filtered(
            scope="studio",
            scope_studio_id=sa.software.studio_id,
            scope_user_id=None,
            studio_ids=None,
            software_ids=[software_id],
            project_ids=None,
            user_ids=None,
            call_types=None,
            work_order_ids=None,
            date_from=date_from,
            date_to=date_to,
        )
    return SoftwareTokenUsageSummaryOut(
        input_tokens=tin,
        output_tokens=tout,
        estimated_cost_usd=cost,
        period_start=date_from,
        period_end=date_to,
    )


@router.get("/{software_id}/history", response_model=GitHistoryResponse)
async def software_git_history(
    software_id: UUID,
    session: AsyncSession = Depends(get_db),
    sa: SoftwareAccess = Depends(get_software_in_studio),
) -> GitHistoryResponse:
    rows = await SoftwareService(session).git_commit_history(
        sa.studio_access, software_id, per_page=30
    )
    return GitHistoryResponse(
        commits=[GitCommitItem.model_validate(r) for r in rows],
    )


@router.post("/{software_id}/git/test", response_model=GitTestResult)
async def test_git_connection(
    software_id: UUID,
    session: AsyncSession = Depends(get_db),
    sa: SoftwareAccess = Depends(require_software_admin_in_studio),
) -> GitTestResult:
    return await SoftwareService(session).test_git(sa.studio_access, software_id)


@router.patch(
    "/{software_id}/artifact-exclusions",
    response_model=ArtifactExclusionPatchResult,
)
async def patch_software_artifact_exclusion(
    studio_id: UUID,
    software_id: UUID,
    body: ArtifactExclusionPatch,
    session: AsyncSession = Depends(get_db),
    sa: SoftwareAccess = Depends(require_software_editor_in_studio),
) -> ArtifactExclusionPatchResult:
    if sa.software.id != software_id or sa.software.studio_id != studio_id:
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message="Software not found.",
        )
    if sa.studio_access.is_cross_studio_viewer:
        raise ApiError(
            status_code=403,
            code="FORBIDDEN",
            message="Cannot manage artifact exclusions with viewer access.",
        )
    excluded = await ArtifactExclusionService(session).set_software_exclusion(
        studio_id=studio_id,
        software_id=software_id,
        artifact_id=body.artifact_id,
        excluded=body.excluded,
        user_id=sa.studio_access.user.id,
    )
    return ArtifactExclusionPatchResult(
        artifact_id=body.artifact_id,
        excluded=excluded,
    )


@router.patch(
    "/{software_id}/projects/{project_id}/artifact-exclusions",
    response_model=ArtifactExclusionPatchResult,
)
async def patch_project_artifact_exclusion(
    studio_id: UUID,
    software_id: UUID,
    project_id: UUID,
    body: ArtifactExclusionPatch,
    session: AsyncSession = Depends(get_db),
    pa: ProjectAccess = Depends(get_project_access_nested),
) -> ArtifactExclusionPatchResult:
    if (
        pa.software.id != software_id
        or pa.project.id != project_id
        or pa.software.studio_id != studio_id
    ):
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message="Project not found.",
        )
    if not pa.studio_access.is_studio_editor:
        raise ApiError(
            status_code=403,
            code="FORBIDDEN",
            message="Membership in this studio is required",
        )
    if pa.studio_access.is_cross_studio_viewer:
        raise ApiError(
            status_code=403,
            code="FORBIDDEN",
            message="Cannot manage artifact exclusions with viewer access.",
        )
    excluded = await ArtifactExclusionService(session).set_project_exclusion(
        studio_id=studio_id,
        software_id=software_id,
        project_id=project_id,
        artifact_id=body.artifact_id,
        excluded=body.excluded,
        user_id=pa.studio_access.user.id,
    )
    return ArtifactExclusionPatchResult(
        artifact_id=body.artifact_id,
        excluded=excluded,
    )
