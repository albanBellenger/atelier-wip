"""Read-only aggregates for a software (dashboard)."""

from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import SoftwareAccess, get_current_user, get_software_access
from app.exceptions import ApiError
from app.models.user import User
from app.schemas.artifact import ArtifactResponse, MarkdownArtifactCreate, SoftwareArtifactRowOut
from app.schemas.attention import SoftwareAttentionListOut
from app.schemas.software_activity import SoftwareActivityListOut
from app.services.attention_service import AttentionService
from app.services.artifact_service import ArtifactService
from app.services import embedding_pipeline as embed_pipeline
from app.services.software_activity_service import SoftwareActivityService
from app.storage.minio_storage import get_storage_client

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
            message="Attention feed is not available with read-only cross-studio access.",
        )
    if not sa.studio_access.is_studio_editor:
        raise ApiError(
            status_code=403,
            code="FORBIDDEN",
            message="Studio Owner or Builder access required",
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
            message="You must belong to the owning studio.",
        )
    if not sa.studio_access.is_studio_editor:
        raise ApiError(
            status_code=403,
            code="FORBIDDEN",
            message="Membership in this studio is required.",
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


def _sw_artifact_content_type(file_type: str) -> str:
    return "application/pdf" if file_type == "pdf" else "text/markdown"


@router.post("/artifacts", response_model=ArtifactResponse)
async def upload_software_artifact(
    software_id: UUID,
    file: UploadFile = File(...),
    name: str | None = Form(None),
    session: AsyncSession = Depends(get_db),
    sa: SoftwareAccess = Depends(get_software_access),
) -> ArtifactResponse:
    if not sa.studio_access.is_studio_editor:
        raise ApiError(
            status_code=403,
            code="FORBIDDEN",
            message="Studio Owner or Builder access required.",
        )
    raw = await file.read()
    if not raw:
        raise ApiError(
            status_code=422,
            code="EMPTY_FILE",
            message="Uploaded file is empty.",
        )
    svc = ArtifactService(session)
    art = await svc.create_upload_for_software(
        software_id=software_id,
        uploaded_by=sa.studio_access.user.id,
        original_filename=file.filename or "upload",
        raw=raw,
        display_name=name,
    )
    storage = get_storage_client()
    try:
        await storage.put_bytes(art.storage_path, raw, _sw_artifact_content_type(art.file_type))
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


@router.post("/artifacts/md", response_model=ArtifactResponse)
async def create_software_markdown_artifact(
    software_id: UUID,
    body: MarkdownArtifactCreate,
    session: AsyncSession = Depends(get_db),
    sa: SoftwareAccess = Depends(get_software_access),
) -> ArtifactResponse:
    if not sa.studio_access.is_studio_editor:
        raise ApiError(
            status_code=403,
            code="FORBIDDEN",
            message="Studio Owner or Builder access required.",
        )
    svc = ArtifactService(session)
    art = await svc.create_markdown_for_software(
        software_id=software_id,
        uploaded_by=sa.studio_access.user.id,
        name=body.name,
        content=body.content,
    )
    raw = body.content.encode("utf-8")
    storage = get_storage_client()
    try:
        await storage.put_bytes(art.storage_path, raw, _sw_artifact_content_type(art.file_type))
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
