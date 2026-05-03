"""Artifact download by id (all scope levels)."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import ensure_user_can_download_artifact, get_current_user
from app.exceptions import ApiError
from app.models.user import User
from app.services.artifact_service import ArtifactService
from app.storage.minio_storage import get_storage_client

router = APIRouter(prefix="/artifacts", tags=["artifacts"])


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
