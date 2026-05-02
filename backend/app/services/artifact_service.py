"""Artifact CRUD and storage."""

from __future__ import annotations

import re
import uuid
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ApiError
from app.models import Artifact, Project, User
from app.schemas.artifact import SoftwareArtifactRowOut
from app.services.document_extract import (
    DocumentExtractError,
    infer_file_type_from_name,
    validate_md_bytes,
    validate_pdf_magic,
)
from app.services.embedding_service import EmbeddingService


def _safe_filename(name: str, file_type: str) -> str:
    base = (name or "file").strip()
    base = re.sub(r"[^\w.\-]+", "_", base, flags=re.ASCII)
    base = base.strip("._") or "file"
    lower = base.lower()
    if file_type == "pdf" and not lower.endswith(".pdf"):
        base = f"{base}.pdf"
    if file_type == "md" and not lower.endswith(".md"):
        base = f"{base}.md"
    return base[:220]


class ArtifactService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_upload(
        self,
        *,
        project_id: UUID,
        uploaded_by: UUID | None,
        original_filename: str,
        raw: bytes,
        display_name: str | None,
    ) -> Artifact:
        emb = EmbeddingService(self.db)
        await emb.require_embedding_ready()

        ft = infer_file_type_from_name(original_filename)
        if ft is None:
            raise ApiError(
                status_code=422,
                code="UNSUPPORTED_FILE_TYPE",
                message="Only PDF and Markdown (.md) files are supported.",
            )
        try:
            if ft == "pdf":
                validate_pdf_magic(raw[:8])
            else:
                validate_md_bytes(raw)
        except DocumentExtractError as e:
            raise ApiError(
                status_code=422,
                code="INVALID_FILE_CONTENT",
                message=str(e),
            ) from e

        aid = uuid.uuid4()
        label = display_name.strip() if display_name else None
        safe = _safe_filename(label or original_filename, ft)
        storage_path = f"{project_id}/{aid}/{safe}"

        art = Artifact(
            id=aid,
            project_id=project_id,
            uploaded_by=uploaded_by,
            name=label or safe,
            file_type=ft,
            size_bytes=len(raw),
            storage_path=storage_path,
        )
        self.db.add(art)
        await self.db.flush()
        return art

    async def create_markdown(
        self,
        *,
        project_id: UUID,
        uploaded_by: UUID | None,
        name: str,
        content: str,
    ) -> Artifact:
        emb = EmbeddingService(self.db)
        await emb.require_embedding_ready()

        raw = content.encode("utf-8")
        try:
            validate_md_bytes(raw)
        except DocumentExtractError as e:
            raise ApiError(
                status_code=422,
                code="INVALID_MARKDOWN",
                message=str(e),
            ) from e

        aid = uuid.uuid4()
        display_name = name.strip()[:512] or "document.md"
        safe = _safe_filename(display_name, "md")
        storage_path = f"{project_id}/{aid}/{safe}"

        art = Artifact(
            id=aid,
            project_id=project_id,
            uploaded_by=uploaded_by,
            name=display_name,
            file_type="md",
            size_bytes=len(raw),
            storage_path=storage_path,
        )
        self.db.add(art)
        await self.db.flush()
        return art

    async def list_artifacts(self, project_id: UUID) -> list[Artifact]:
        r = await self.db.execute(
            select(Artifact)
            .where(Artifact.project_id == project_id)
            .order_by(Artifact.created_at.desc())
        )
        return list(r.scalars().all())

    async def list_artifacts_for_software(
        self, software_id: UUID
    ) -> list[SoftwareArtifactRowOut]:
        r = await self.db.execute(
            select(Artifact, Project.name, User.display_name)
            .join(Project, Artifact.project_id == Project.id)
            .outerjoin(User, Artifact.uploaded_by == User.id)
            .where(Project.software_id == software_id)
            .order_by(Artifact.created_at.desc())
        )
        out: list[SoftwareArtifactRowOut] = []
        for art, project_name, uploader_display in r.all():
            out.append(
                SoftwareArtifactRowOut(
                    id=art.id,
                    project_id=art.project_id,
                    project_name=project_name,
                    name=art.name,
                    file_type=art.file_type,
                    size_bytes=art.size_bytes,
                    uploaded_by=art.uploaded_by,
                    uploaded_by_display=uploader_display,
                    created_at=art.created_at,
                )
            )
        return out

    async def get_in_project(self, project_id: UUID, artifact_id: UUID) -> Artifact:
        art = await self.db.get(Artifact, artifact_id)
        if art is None or art.project_id != project_id:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Artifact not found.",
            )
        return art

    async def delete(self, project_id: UUID, artifact_id: UUID) -> str:
        art = await self.get_in_project(project_id, artifact_id)
        path = art.storage_path
        await self.db.delete(art)
        await self.db.flush()
        return path
