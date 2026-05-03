"""Project artifacts: upload, list, download, delete."""

from __future__ import annotations

from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    Response,
    UploadFile,
)
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from app.database import get_db
from app.deps import (
    ProjectAccess,
    ensure_user_can_reindex_artifact,
    get_project_access,
    get_project_access_artifact_download,
    require_project_member,
    require_project_studio_admin,
    user_can_view_artifact_chunk_previews,
)
from app.exceptions import ApiError
from app.schemas.artifact import (
    ArtifactDetailResponse,
    ArtifactResponse,
    MarkdownArtifactCreate,
)
from app.services import embedding_pipeline as embed_pipeline
from app.services.artifact_service import ArtifactService
from app.storage.minio_storage import get_storage_client

router = APIRouter(prefix="/projects/{project_id}/artifacts", tags=["artifacts"])
log = structlog.get_logger("atelier.artifacts")


def _content_type(file_type: str) -> str:
    return "application/pdf" if file_type == "pdf" else "text/markdown"


@router.post("", response_model=ArtifactResponse)
async def upload_artifact(
    project_id: UUID,
    file: UploadFile = File(...),
    name: str | None = Form(None),
    session: AsyncSession = Depends(get_db),
    pa: ProjectAccess = Depends(require_project_member),
) -> ArtifactResponse:
    if pa.project.id != project_id:
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message="Project not found.",
        )
    raw = await file.read()
    if not raw:
        raise ApiError(
            status_code=422,
            code="EMPTY_FILE",
            message="Uploaded file is empty.",
        )
    svc = ArtifactService(session)
    art = await svc.create_upload(
        project_id=project_id,
        uploaded_by=pa.studio_access.user.id,
        original_filename=file.filename or "upload",
        raw=raw,
        display_name=name,
    )
    storage = get_storage_client()
    try:
        await storage.put_bytes(art.storage_path, raw, _content_type(art.file_type))
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


@router.post("/md", response_model=ArtifactResponse)
async def create_markdown_artifact(
    project_id: UUID,
    body: MarkdownArtifactCreate,
    session: AsyncSession = Depends(get_db),
    pa: ProjectAccess = Depends(require_project_member),
) -> ArtifactResponse:
    if pa.project.id != project_id:
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message="Project not found.",
        )
    svc = ArtifactService(session)
    art = await svc.create_markdown(
        project_id=project_id,
        uploaded_by=pa.studio_access.user.id,
        name=body.name,
        content=body.content,
    )
    raw = body.content.encode("utf-8")
    storage = get_storage_client()
    try:
        await storage.put_bytes(art.storage_path, raw, _content_type(art.file_type))
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


@router.get("", response_model=list[ArtifactResponse])
async def list_artifacts(
    project_id: UUID,
    session: AsyncSession = Depends(get_db),
    pa: ProjectAccess = Depends(get_project_access),
) -> list[ArtifactResponse]:
    if pa.project.id != project_id:
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message="Project not found.",
        )
    rows = await ArtifactService(session).list_artifacts(project_id)
    return [ArtifactResponse.model_validate(a) for a in rows]


@router.get("/{artifact_id}", response_model=ArtifactDetailResponse)
async def get_artifact_detail(
    project_id: UUID,
    artifact_id: UUID,
    session: AsyncSession = Depends(get_db),
    pa: ProjectAccess = Depends(get_project_access_artifact_download),
) -> ArtifactDetailResponse:
    if pa.project.id != project_id:
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message="Project not found.",
        )
    svc = ArtifactService(session)
    art = await svc.get_in_project(project_id, artifact_id)
    include = await user_can_view_artifact_chunk_previews(
        session, pa.studio_access.user, art
    )
    return await svc.build_artifact_detail(art, include_chunk_previews=include)


@router.get("/{artifact_id}/download")
async def download_artifact(
    project_id: UUID,
    artifact_id: UUID,
    session: AsyncSession = Depends(get_db),
    pa: ProjectAccess = Depends(get_project_access_artifact_download),
) -> Response:
    if pa.project.id != project_id:
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message="Project not found.",
        )
    art = await ArtifactService(session).get_in_project(project_id, artifact_id)
    storage = get_storage_client()
    try:
        data = await storage.get_bytes(art.storage_path)
    except Exception as exc:
        raise ApiError(
            status_code=502,
            code="STORAGE_ERROR",
            message="Could not read file.",
        ) from exc
    media = _content_type(art.file_type)
    safe = art.name.replace('"', "").replace("\r", "").replace("\n", "")[:200]
    return Response(
        content=data,
        media_type=media,
        headers={
            "Content-Disposition": f'attachment; filename="{safe}"',
        },
    )


@router.post("/{artifact_id}/reindex", status_code=204)
async def reindex_project_artifact(
    project_id: UUID,
    artifact_id: UUID,
    session: AsyncSession = Depends(get_db),
    pa: ProjectAccess = Depends(require_project_member),
) -> Response:
    if pa.project.id != project_id:
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message="Project not found.",
        )
    svc = ArtifactService(session)
    art = await svc.get_in_project(project_id, artifact_id)
    await ensure_user_can_reindex_artifact(session, pa.studio_access.user, art)
    await embed_pipeline.embed_artifact_in_upload_session(session, art.id)
    return Response(status_code=204)


@router.delete("/{artifact_id}", status_code=204)
async def delete_artifact(
    project_id: UUID,
    artifact_id: UUID,
    session: AsyncSession = Depends(get_db),
    pa: ProjectAccess = Depends(require_project_studio_admin),
) -> Response:
    if pa.project.id != project_id:
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message="Project not found.",
        )
    svc = ArtifactService(session)
    path = await svc.delete(project_id, artifact_id)
    storage = get_storage_client()
    try:
        await storage.remove(path)
    except Exception:
        log.warning("minio_remove_failed", storage_path=path)
    return Response(status_code=204)
