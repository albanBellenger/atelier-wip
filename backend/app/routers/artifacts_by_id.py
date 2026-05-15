"""Artifact routes by id (all scope levels)."""

from __future__ import annotations

from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import (
    ensure_user_can_configure_chunking_strategy,
    ensure_user_can_delete_artifact,
    ensure_user_can_download_artifact,
    ensure_user_can_reindex_artifact,
    get_current_user,
    user_can_view_artifact_chunk_previews,
)
from app.exceptions import ApiError
from app.models.user import User
from app.schemas.artifact import (
    ArtifactChunkingStrategyPatch,
    ArtifactDetailResponse,
    ArtifactScopePatch,
    ChunkingStrategiesResponse,
)
from app.services import embedding_pipeline as embed_pipeline
from app.services.artifact_chunking import ARTIFACT_CHUNKING_STRATEGIES
from app.services.artifact_service import ArtifactService
from app.storage.minio_storage import get_storage_client

router = APIRouter(prefix="/artifacts", tags=["artifacts"])
log = structlog.get_logger("atelier.artifacts_by_id")


@router.get("/chunking-strategies", response_model=ChunkingStrategiesResponse)
async def list_chunking_strategies(
    _user: User = Depends(get_current_user),
) -> ChunkingStrategiesResponse:
    return ChunkingStrategiesResponse(strategies=list(ARTIFACT_CHUNKING_STRATEGIES))


@router.get("/{artifact_id}", response_model=ArtifactDetailResponse)
async def get_artifact_detail_by_id(
    artifact_id: UUID,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ArtifactDetailResponse:
    svc = ArtifactService(session)
    art = await svc.get_by_id(artifact_id)
    if art is None:
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message="Artifact not found.",
        )
    await ensure_user_can_download_artifact(session, user, art)
    include = await user_can_view_artifact_chunk_previews(session, user, art)
    return await svc.build_artifact_detail(art, include_chunk_previews=include)


def _content_type(file_type: str) -> str:
    return "application/pdf" if file_type == "pdf" else "text/markdown"


@router.get("/{artifact_id}/download")
async def download_artifact_by_id(
    artifact_id: UUID,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    svc = ArtifactService(session)
    art = await svc.get_by_id(artifact_id)
    if art is None:
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message="Artifact not found.",
        )
    await ensure_user_can_download_artifact(session, user, art)
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
async def reindex_artifact_by_id(
    artifact_id: UUID,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    svc = ArtifactService(session)
    art = await svc.get_by_id(artifact_id)
    if art is None:
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message="Artifact not found.",
        )
    await ensure_user_can_reindex_artifact(session, user, art)
    await embed_pipeline.embed_artifact_in_upload_session(session, art.id)
    return Response(status_code=204)


@router.patch("/{artifact_id}/chunking-strategy", response_model=ArtifactDetailResponse)
async def patch_artifact_chunking_strategy(
    artifact_id: UUID,
    body: ArtifactChunkingStrategyPatch,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ArtifactDetailResponse:
    svc = ArtifactService(session)
    art = await svc.get_by_id(artifact_id)
    if art is None:
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message="Artifact not found.",
        )
    await ensure_user_can_configure_chunking_strategy(session, user, art)
    art2 = await svc.set_chunking_strategy(artifact_id, body.chunking_strategy)
    include = await user_can_view_artifact_chunk_previews(session, user, art2)
    return await svc.build_artifact_detail(art2, include_chunk_previews=include)


@router.patch("/{artifact_id}/scope", response_model=ArtifactDetailResponse)
async def patch_artifact_scope(
    artifact_id: UUID,
    body: ArtifactScopePatch,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ArtifactDetailResponse:
    svc = ArtifactService(session)
    art = await svc.get_by_id(artifact_id)
    if art is None:
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message="Artifact not found.",
        )
    await ensure_user_can_delete_artifact(session, user, art)
    art2 = await svc.change_artifact_scope(
        artifact_id,
        scope_level=body.scope_level,
        software_id=body.software_id,
        project_id=body.project_id,
    )
    include = await user_can_view_artifact_chunk_previews(session, user, art2)
    return await svc.build_artifact_detail(art2, include_chunk_previews=include)


@router.delete("/{artifact_id}", status_code=204)
async def delete_artifact_by_id(
    artifact_id: UUID,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    svc = ArtifactService(session)
    art = await svc.get_by_id(artifact_id)
    if art is None:
        raise ApiError(
            status_code=404,
            code="NOT_FOUND",
            message="Artifact not found.",
        )
    await ensure_user_can_delete_artifact(session, user, art)
    path = await svc.delete_by_id(artifact_id, actor_user_id=user.id)
    storage = get_storage_client()
    try:
        await storage.remove(path)
    except Exception:
        log.warning("minio_remove_failed", storage_path=path)
    return Response(status_code=204)
