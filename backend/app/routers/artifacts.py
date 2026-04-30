"""Project artifacts: upload, list, download, delete."""

from __future__ import annotations

from uuid import UUID

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    Response,
    UploadFile,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import ProjectAccess, get_project_access, require_project_member
from app.exceptions import ApiError
from app.schemas.artifact import ArtifactResponse, MarkdownArtifactCreate
from app.services.artifact_service import ArtifactService
from app.services.embedding_pipeline import schedule_artifact_embedding
from app.storage.minio_storage import get_storage_client

router = APIRouter(prefix="/projects/{project_id}/artifacts", tags=["artifacts"])


def _content_type(file_type: str) -> str:
    return "application/pdf" if file_type == "pdf" else "text/markdown"


def _kick_artifact_embed(artifact_id: UUID) -> None:
    schedule_artifact_embedding(artifact_id)


@router.post("", response_model=ArtifactResponse)
async def upload_artifact(
    project_id: UUID,
    background_tasks: BackgroundTasks,
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
        raise ApiError(
            status_code=502,
            code="STORAGE_ERROR",
            message="Could not store file.",
        ) from exc

    background_tasks.add_task(_kick_artifact_embed, art.id)
    return ArtifactResponse.model_validate(art)


@router.post("/md", response_model=ArtifactResponse)
async def create_markdown_artifact(
    project_id: UUID,
    body: MarkdownArtifactCreate,
    background_tasks: BackgroundTasks,
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
        raise ApiError(
            status_code=502,
            code="STORAGE_ERROR",
            message="Could not store file.",
        ) from exc

    background_tasks.add_task(_kick_artifact_embed, art.id)
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


@router.get("/{artifact_id}/download")
async def download_artifact(
    project_id: UUID,
    artifact_id: UUID,
    session: AsyncSession = Depends(get_db),
    pa: ProjectAccess = Depends(get_project_access),
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


@router.delete("/{artifact_id}", status_code=204)
async def delete_artifact(
    project_id: UUID,
    artifact_id: UUID,
    session: AsyncSession = Depends(get_db),
    pa: ProjectAccess = Depends(require_project_member),
) -> None:
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
        pass
