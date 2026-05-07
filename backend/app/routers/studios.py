"""Studio routes."""

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Query, Request, Response, UploadFile
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import (
    StudioAccess,
    StudioSoftwareListAccess,
    get_current_user,
    get_studio_access,
    get_studio_software_list_access,
    require_studio_admin,
    require_studio_editor,
    resolve_studio_access,
    resolve_studio_access_for_software,
)
from app.exceptions import ApiError
from app.models import Project, Software, User, WorkOrder
from app.schemas.artifact import (
    ArtifactResponse,
    MarkdownArtifactCreate,
    StudioArtifactRowOut,
)
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
from app.schemas.studio_capabilities import StudioCapabilitiesOut
from app.schemas.studio_llm_public import StudioChatLlmModelsOut
from app.services.artifact_service import ArtifactService
from app.services.cross_studio_service import CrossStudioService
from app.services import embedding_pipeline as embed_pipeline
from app.services.mcp_key_admin_service import McpKeyAdminService
from app.services.rbac_capabilities_service import RbacCapabilitiesService
from app.services.project_service import ProjectService
from app.services.software_activity_service import SoftwareActivityService
from app.services.studio_service import StudioService
from app.services.token_usage_query_service import TokenUsageQueryService
from app.services.llm_policy_service import LlmPolicyService
from app.storage.minio_storage import get_storage_client

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
    "/{studio_id}/me/capabilities",
    response_model=StudioCapabilitiesOut,
)
async def get_my_studio_capabilities(
    studio_id: UUID,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    software_id: UUID | None = Query(None),
) -> StudioCapabilitiesOut:
    """Effective RBAC flags for the current user; optional ``software_id`` resolves cross-studio grants."""
    if software_id is None:
        access = await resolve_studio_access(session, user, studio_id)
    else:
        software = await session.get(Software, software_id)
        if software is None or software.studio_id != studio_id:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Software not found",
            )
        access = await resolve_studio_access_for_software(session, user, software)
    return await RbacCapabilitiesService(session).build_response(access)


@router.get(
    "/{studio_id}/llm-chat-models",
    response_model=StudioChatLlmModelsOut,
)
async def studio_llm_chat_models(
    studio_id: UUID,
    session: AsyncSession = Depends(get_db),
    access: StudioAccess = Depends(get_studio_access),
) -> StudioChatLlmModelsOut:
    return await LlmPolicyService(session).studio_chat_llm_models(access.studio_id)


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
            message="You must belong to the owning studio.",
        )
    if not access.is_studio_editor:
        raise ApiError(
            status_code=403,
            code="FORBIDDEN",
            message="Membership in this studio is required.",
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


def _studio_artifact_content_type(file_type: str) -> str:
    return "application/pdf" if file_type == "pdf" else "text/markdown"


@router.get("/{studio_id}/artifact-library", response_model=list[StudioArtifactRowOut])
async def list_artifact_library(
    studio_id: UUID,
    for_software_id: UUID | None = Query(None, alias="softwareId"),
    session: AsyncSession = Depends(get_db),
    list_access: StudioSoftwareListAccess = Depends(get_studio_software_list_access),
) -> list[StudioArtifactRowOut]:
    if list_access.studio_access.studio_id != studio_id:
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message="Studio not found.",
        )
    return await ArtifactService(session).list_artifact_library_for_studio(
        studio_id,
        for_software_id=for_software_id,
        allowed_software_ids=list_access.allowed_software_ids,
    )


@router.post("/{studio_id}/artifacts", response_model=ArtifactResponse)
async def upload_studio_artifact(
    studio_id: UUID,
    file: UploadFile = File(...),
    name: str | None = Form(None),
    session: AsyncSession = Depends(get_db),
    access: StudioAccess = Depends(require_studio_editor),
) -> ArtifactResponse:
    if access.studio_id != studio_id:
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message="Studio not found.",
        )
    raw = await file.read()
    if not raw:
        raise ApiError(
            status_code=422,
            code="EMPTY_FILE",
            message="Uploaded file is empty.",
        )
    svc = ArtifactService(session)
    art = await svc.create_upload_for_studio(
        studio_id=studio_id,
        uploaded_by=access.user.id,
        original_filename=file.filename or "upload",
        raw=raw,
        display_name=name,
    )
    storage = get_storage_client()
    try:
        await storage.put_bytes(art.storage_path, raw, _studio_artifact_content_type(art.file_type))
    except Exception as exc:
        await session.delete(art)
        await session.flush()
        raise ApiError(
            status_code=502,
            code="STORAGE_ERROR",
            message="Could not store file.",
        ) from exc
    await embed_pipeline.embed_artifact_in_upload_session(session, art.id)
    return ArtifactResponse.model_validate(art)


@router.post("/{studio_id}/artifacts/md", response_model=ArtifactResponse)
async def create_studio_markdown_artifact(
    studio_id: UUID,
    body: MarkdownArtifactCreate,
    session: AsyncSession = Depends(get_db),
    access: StudioAccess = Depends(require_studio_editor),
) -> ArtifactResponse:
    if access.studio_id != studio_id:
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message="Studio not found.",
        )
    svc = ArtifactService(session)
    art = await svc.create_markdown_for_studio(
        studio_id=studio_id,
        uploaded_by=access.user.id,
        name=body.name,
        content=body.content,
    )
    raw = body.content.encode("utf-8")
    storage = get_storage_client()
    try:
        await storage.put_bytes(art.storage_path, raw, _studio_artifact_content_type(art.file_type))
    except Exception as exc:
        await session.delete(art)
        await session.flush()
        raise ApiError(
            status_code=502,
            code="STORAGE_ERROR",
            message="Could not store file.",
        ) from exc
    await embed_pipeline.embed_artifact_in_upload_session(session, art.id)
    return ArtifactResponse.model_validate(art)


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
    software_id: list[UUID] | None = Query(None),
    project_id: list[UUID] | None = Query(None),
    work_order_id: list[UUID] | None = Query(None),
    user_id: list[UUID] | None = Query(None),
    call_type: list[str] | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    limit: int = Query(100, ge=1, le=5000),
    offset: int = Query(0, ge=0),
):
    sid = access.studio_id
    if software_id:
        for swi in software_id:
            sw = await session.get(Software, swi)
            if sw is None or sw.studio_id != sid:
                raise ApiError(
                    status_code=404,
                    code="NOT_FOUND",
                    message="Software not found.",
                )
    if project_id:
        for pid in project_id:
            pr = await session.get(Project, pid)
            if pr is None:
                raise ApiError(
                    status_code=404,
                    code="NOT_FOUND",
                    message="Project not found.",
                )
            sw = await session.get(Software, pr.software_id)
            if sw is None or sw.studio_id != sid:
                raise ApiError(
                    status_code=404,
                    code="NOT_FOUND",
                    message="Project not found.",
                )
    if work_order_id:
        for woid in work_order_id:
            wo = await session.get(WorkOrder, woid)
            if wo is None:
                raise ApiError(
                    status_code=404,
                    code="NOT_FOUND",
                    message="Work order not found.",
                )
            pr = await session.get(Project, wo.project_id)
            if pr is None:
                raise ApiError(
                    status_code=404,
                    code="NOT_FOUND",
                    message="Project not found.",
                )
            sw = await session.get(Software, pr.software_id)
            if sw is None or sw.studio_id != sid:
                raise ApiError(
                    status_code=404,
                    code="NOT_FOUND",
                    message="Work order not found.",
                )

    svc = TokenUsageQueryService(session)
    csv_mode = _studio_wants_csv(request)
    lim = 500_000 if csv_mode else limit
    off = 0 if csv_mode else offset
    ct = [c.strip() for c in (call_type or []) if c and c.strip()]
    rows, totals = await svc.list_rows(
        scope="studio",
        scope_studio_id=sid,
        scope_user_id=None,
        studio_ids=None,
        software_ids=software_id,
        project_ids=project_id,
        user_ids=user_id,
        call_types=ct or None,
        work_order_ids=work_order_id,
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
