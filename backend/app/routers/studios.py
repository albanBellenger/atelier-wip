"""Studio routes."""

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import (
    StudioAccess,
    get_current_user,
    get_studio_access,
    require_studio_admin,
)
from app.exceptions import ApiError
from app.models import User
from app.schemas.artifact import StudioArtifactRowOut
from app.schemas.cross_studio import CrossStudioRequestCreate, CrossStudioRequestResult
from app.schemas.mcp_keys import McpKeyCreateBody, McpKeyCreatedResponse, McpKeyPublic
from app.schemas.token_usage_report import (
    TokenUsageReportOut,
    TokenUsageRowOut,
    TokenUsageTotalsOut,
)
from app.schemas.project import StudioProjectListItemOut
from app.schemas.software_activity import SoftwareActivityListOut
from app.schemas.studio import (
    MemberInvite,
    MemberRoleUpdate,
    StudioCreate,
    StudioMemberResponse,
    StudioResponse,
    StudioUpdate,
)
from app.services.artifact_service import ArtifactService
from app.services.cross_studio_service import CrossStudioService
from app.services.mcp_key_admin_service import McpKeyAdminService
from app.services.project_service import ProjectService
from app.services.software_activity_service import SoftwareActivityService
from app.services.studio_service import StudioService
from app.services.token_usage_query_service import TokenUsageQueryService

router = APIRouter(prefix="/studios", tags=["studios"])


def _studio_wants_csv(request: Request) -> bool:
    accept = (request.headers.get("accept") or "").lower()
    return "text/csv" in accept


@router.get("", response_model=list[StudioResponse])
async def list_studios(
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[StudioResponse]:
    return await StudioService(session).list_studios(user)


@router.post("", response_model=StudioResponse)
async def create_studio(
    body: StudioCreate,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> StudioResponse:
    return await StudioService(session).create_studio(user, body)


@router.get(
    "/{studio_id}/projects",
    response_model=list[StudioProjectListItemOut],
)
async def list_studio_projects(
    studio_id: UUID,
    include_archived: bool = False,
    session: AsyncSession = Depends(get_db),
    access: StudioAccess = Depends(get_studio_access),
) -> list[StudioProjectListItemOut]:
    return await ProjectService(session).list_projects_for_studio(
        access.studio_id,
        include_archived=include_archived,
    )


@router.get("/{studio_id}/activity", response_model=SoftwareActivityListOut)
async def list_studio_activity(
    studio_id: UUID,
    limit: int = Query(30, ge=1, le=100),
    session: AsyncSession = Depends(get_db),
    access: StudioAccess = Depends(get_studio_access),
) -> SoftwareActivityListOut:
    if not access.can_create_project:
        raise ApiError(
            status_code=403,
            code="FORBIDDEN",
            message="Owning studio membership required.",
        )
    if not access.is_studio_editor:
        raise ApiError(
            status_code=403,
            code="FORBIDDEN",
            message="Studio membership required.",
        )
    items = await SoftwareActivityService(session).list_activity_items_out_for_studio(
        access.studio_id,
        limit=limit,
    )
    return SoftwareActivityListOut(items=items)


@router.get("/{studio_id}/artifacts", response_model=list[StudioArtifactRowOut])
async def list_studio_artifacts(
    studio_id: UUID,
    session: AsyncSession = Depends(get_db),
    access: StudioAccess = Depends(get_studio_access),
) -> list[StudioArtifactRowOut]:
    return await ArtifactService(session).list_artifacts_for_studio(access.studio_id)


@router.get("/{studio_id}", response_model=StudioResponse)
async def get_studio(
    session: AsyncSession = Depends(get_db),
    access: StudioAccess = Depends(get_studio_access),
) -> StudioResponse:
    return await StudioService(session).get_studio(access)


@router.patch("/{studio_id}", response_model=StudioResponse)
async def update_studio(
    body: StudioUpdate,
    session: AsyncSession = Depends(get_db),
    access: StudioAccess = Depends(require_studio_admin),
) -> StudioResponse:
    return await StudioService(session).update_studio(access, body)


@router.delete("/{studio_id}", status_code=204)
async def delete_studio(
    session: AsyncSession = Depends(get_db),
    access: StudioAccess = Depends(require_studio_admin),
) -> Response:
    await StudioService(session).delete_studio(access)
    return Response(status_code=204)


@router.get("/{studio_id}/members", response_model=list[StudioMemberResponse])
async def list_members(
    session: AsyncSession = Depends(get_db),
    access: StudioAccess = Depends(get_studio_access),
) -> list[StudioMemberResponse]:
    return await StudioService(session).list_members(access)


@router.post("/{studio_id}/members", response_model=StudioMemberResponse)
async def add_member(
    body: MemberInvite,
    session: AsyncSession = Depends(get_db),
    access: StudioAccess = Depends(require_studio_admin),
) -> StudioMemberResponse:
    return await StudioService(session).add_member(access, body)


@router.delete("/{studio_id}/members/{user_id}", status_code=204)
async def remove_member(
    user_id: UUID,
    session: AsyncSession = Depends(get_db),
    access: StudioAccess = Depends(require_studio_admin),
) -> Response:
    await StudioService(session).remove_member(access, user_id)
    return Response(status_code=204)


@router.patch("/{studio_id}/members/{user_id}", response_model=StudioMemberResponse)
async def update_member_role(
    user_id: UUID,
    body: MemberRoleUpdate,
    session: AsyncSession = Depends(get_db),
    access: StudioAccess = Depends(require_studio_admin),
) -> StudioMemberResponse:
    return await StudioService(session).update_member_role(access, user_id, body)


@router.post(
    "/{studio_id}/cross-studio-request",
    response_model=CrossStudioRequestResult,
)
async def create_cross_studio_request(
    studio_id: UUID,
    body: CrossStudioRequestCreate,
    session: AsyncSession = Depends(get_db),
    access: StudioAccess = Depends(require_studio_admin),
) -> CrossStudioRequestResult:
    result = await CrossStudioService(session).create_request(access, body)
    await session.commit()
    return result


@router.get("/{studio_id}/token-usage")
async def studio_token_usage(
    studio_id: UUID,
    request: Request,
    session: AsyncSession = Depends(get_db),
    access: StudioAccess = Depends(require_studio_admin),
    software_id: UUID | None = Query(None),
    project_id: UUID | None = Query(None),
    user_id: UUID | None = Query(None),
    call_type: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    limit: int = Query(100, ge=1, le=5000),
    offset: int = Query(0, ge=0),
):
    svc = TokenUsageQueryService(session)
    csv_mode = _studio_wants_csv(request)
    lim = 500_000 if csv_mode else limit
    off = 0 if csv_mode else offset
    rows, totals = await svc.list_rows(
        scope="studio",
        scope_studio_id=access.studio_id,
        scope_user_id=None,
        studio_id=None,
        software_id=software_id,
        project_id=project_id,
        user_id=user_id,
        call_type=call_type,
        date_from=date_from,
        date_to=date_to,
        limit=lim,
        offset=off,
    )
    if csv_mode:
        body = svc.rows_to_csv(rows)
        return Response(
            content=body.encode("utf-8"),
            media_type="text/csv",
            headers={
                "Content-Disposition": 'attachment; filename="studio-token-usage.csv"'
            },
        )
    tin, tout, cost = totals
    return TokenUsageReportOut(
        rows=[TokenUsageRowOut.model_validate(r) for r in rows],
        totals=TokenUsageTotalsOut(
            input_tokens=tin,
            output_tokens=tout,
            estimated_cost_usd=cost,
        ),
    )


@router.get("/{studio_id}/mcp-keys", response_model=list[McpKeyPublic])
async def list_mcp_keys(
    session: AsyncSession = Depends(get_db),
    access: StudioAccess = Depends(require_studio_admin),
) -> list[McpKeyPublic]:
    return await McpKeyAdminService(session).list_keys(access)


@router.post("/{studio_id}/mcp-keys", response_model=McpKeyCreatedResponse)
async def create_mcp_key(
    body: McpKeyCreateBody,
    session: AsyncSession = Depends(get_db),
    access: StudioAccess = Depends(require_studio_admin),
) -> McpKeyCreatedResponse:
    result = await McpKeyAdminService(session).create_key(access, body)
    await session.commit()
    return result


@router.delete("/{studio_id}/mcp-keys/{key_id}", status_code=204)
async def revoke_mcp_key(
    key_id: UUID,
    session: AsyncSession = Depends(get_db),
    access: StudioAccess = Depends(require_studio_admin),
) -> Response:
    await McpKeyAdminService(session).revoke_key(access, key_id)
    await session.commit()
    return Response(status_code=204)
