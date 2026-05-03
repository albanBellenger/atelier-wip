"""Artifact CRUD and storage."""

from __future__ import annotations

import re
import uuid
from uuid import UUID

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ApiError
from app.models import Artifact, Project, Software, User
from app.models.artifact_exclusion import (
    ProjectArtifactExclusion,
    SoftwareArtifactExclusion,
)
from app.schemas.artifact import (
    ArtifactScopeLevel,
    SoftwareArtifactRowOut,
    StudioArtifactRowOut,
)
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

    async def get_by_id(self, artifact_id: UUID) -> Artifact | None:
        return await self.db.get(Artifact, artifact_id)

    def _validate_upload_bytes(self, original_filename: str, raw: bytes) -> str:
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
        return ft

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

        ft = self._validate_upload_bytes(original_filename, raw)

        aid = uuid.uuid4()
        label = display_name.strip() if display_name else None
        safe = _safe_filename(label or original_filename, ft)
        storage_path = f"{project_id}/{aid}/{safe}"

        art = Artifact(
            id=aid,
            project_id=project_id,
            scope_level="project",
            library_studio_id=None,
            library_software_id=None,
            uploaded_by=uploaded_by,
            name=label or safe,
            file_type=ft,
            size_bytes=len(raw),
            storage_path=storage_path,
        )
        self.db.add(art)
        await self.db.flush()
        return art

    async def create_upload_for_studio(
        self,
        *,
        studio_id: UUID,
        uploaded_by: UUID | None,
        original_filename: str,
        raw: bytes,
        display_name: str | None,
    ) -> Artifact:
        emb = EmbeddingService(self.db)
        await emb.require_embedding_ready()

        ft = self._validate_upload_bytes(original_filename, raw)

        aid = uuid.uuid4()
        label = display_name.strip() if display_name else None
        safe = _safe_filename(label or original_filename, ft)
        storage_path = f"studio/{studio_id}/{aid}/{safe}"

        art = Artifact(
            id=aid,
            project_id=None,
            scope_level="studio",
            library_studio_id=studio_id,
            library_software_id=None,
            uploaded_by=uploaded_by,
            name=label or safe,
            file_type=ft,
            size_bytes=len(raw),
            storage_path=storage_path,
        )
        self.db.add(art)
        await self.db.flush()
        return art

    async def create_upload_for_software(
        self,
        *,
        software_id: UUID,
        uploaded_by: UUID | None,
        original_filename: str,
        raw: bytes,
        display_name: str | None,
    ) -> Artifact:
        emb = EmbeddingService(self.db)
        await emb.require_embedding_ready()

        sw = await self.db.get(Software, software_id)
        if sw is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Software not found.",
            )

        ft = self._validate_upload_bytes(original_filename, raw)

        aid = uuid.uuid4()
        label = display_name.strip() if display_name else None
        safe = _safe_filename(label or original_filename, ft)
        storage_path = f"software/{software_id}/{aid}/{safe}"

        art = Artifact(
            id=aid,
            project_id=None,
            scope_level="software",
            library_studio_id=sw.studio_id,
            library_software_id=software_id,
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
            scope_level="project",
            library_studio_id=None,
            library_software_id=None,
            uploaded_by=uploaded_by,
            name=display_name,
            file_type="md",
            size_bytes=len(raw),
            storage_path=storage_path,
        )
        self.db.add(art)
        await self.db.flush()
        return art

    async def create_markdown_for_studio(
        self,
        *,
        studio_id: UUID,
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
        storage_path = f"studio/{studio_id}/{aid}/{safe}"

        art = Artifact(
            id=aid,
            project_id=None,
            scope_level="studio",
            library_studio_id=studio_id,
            library_software_id=None,
            uploaded_by=uploaded_by,
            name=display_name,
            file_type="md",
            size_bytes=len(raw),
            storage_path=storage_path,
        )
        self.db.add(art)
        await self.db.flush()
        return art

    async def create_markdown_for_software(
        self,
        *,
        software_id: UUID,
        uploaded_by: UUID | None,
        name: str,
        content: str,
    ) -> Artifact:
        emb = EmbeddingService(self.db)
        await emb.require_embedding_ready()

        sw = await self.db.get(Software, software_id)
        if sw is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Software not found.",
            )

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
        storage_path = f"software/{software_id}/{aid}/{safe}"

        art = Artifact(
            id=aid,
            project_id=None,
            scope_level="software",
            library_studio_id=sw.studio_id,
            library_software_id=software_id,
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
            .where(
                Artifact.project_id == project_id,
                Artifact.scope_level == "project",
            )
            .order_by(Artifact.created_at.desc())
        )
        return list(r.scalars().all())

    def _row_scope_level(self, art: Artifact) -> ArtifactScopeLevel:
        sl = art.scope_level or "project"
        if sl in ("studio", "software", "project"):
            return sl  # type: ignore[return-value]
        return "project"

    async def _list_project_scoped_rows_for_software(
        self,
        software_id: UUID,
        *,
        for_project_id: UUID | None,
    ) -> list[tuple[Artifact, str, str | None, object, object]]:
        sae = SoftwareArtifactExclusion
        pae = ProjectArtifactExclusion
        pae_project_match = (
            for_project_id if for_project_id is not None else Artifact.project_id
        )
        r = await self.db.execute(
            select(Artifact, Project.name, User.display_name, sae.created_at, pae.created_at)
            .join(Project, Artifact.project_id == Project.id)
            .outerjoin(
                sae,
                and_(
                    sae.artifact_id == Artifact.id,
                    sae.software_id == software_id,
                ),
            )
            .outerjoin(
                pae,
                and_(
                    pae.artifact_id == Artifact.id,
                    pae.project_id == pae_project_match,
                ),
            )
            .outerjoin(User, Artifact.uploaded_by == User.id)
            .where(
                Project.software_id == software_id,
                Artifact.scope_level == "project",
            )
            .order_by(Artifact.created_at.desc())
        )
        return list(r.all())

    async def _list_software_scoped_rows_for_software(
        self,
        software_id: UUID,
    ) -> list[tuple[Artifact, None, str | None, object, None]]:
        sae = SoftwareArtifactExclusion
        r = await self.db.execute(
            select(Artifact, User.display_name, sae.created_at)
            .where(
                Artifact.scope_level == "software",
                Artifact.library_software_id == software_id,
            )
            .outerjoin(
                sae,
                and_(
                    sae.artifact_id == Artifact.id,
                    sae.software_id == software_id,
                ),
            )
            .outerjoin(User, Artifact.uploaded_by == User.id)
            .order_by(Artifact.created_at.desc())
        )
        out: list[tuple[Artifact, None, str | None, object, None]] = []
        for art, uploader_display, ex_sw in r.all():
            out.append((art, None, uploader_display, ex_sw, None))
        return out

    async def list_artifacts_for_software(
        self,
        software_id: UUID,
        *,
        for_project_id: UUID | None = None,
    ) -> list[SoftwareArtifactRowOut]:
        combined: list[SoftwareArtifactRowOut] = []

        for art, project_name, uploader_display, ex_sw, ex_proj in (
            await self._list_project_scoped_rows_for_software(
                software_id, for_project_id=for_project_id
            )
        ):
            pn = str(project_name) if project_name is not None else None
            combined.append(
                SoftwareArtifactRowOut(
                    id=art.id,
                    project_id=art.project_id,
                    project_name=pn,
                    name=art.name,
                    file_type=art.file_type,
                    size_bytes=art.size_bytes,
                    uploaded_by=art.uploaded_by,
                    uploaded_by_display=uploader_display,
                    created_at=art.created_at,
                    scope_level=self._row_scope_level(art),
                    excluded_at_software=ex_sw,
                    excluded_at_project=ex_proj,
                )
            )

        for art, _pn, uploader_display, ex_sw, ex_proj in (
            await self._list_software_scoped_rows_for_software(software_id)
        ):
            combined.append(
                SoftwareArtifactRowOut(
                    id=art.id,
                    project_id=None,
                    project_name=None,
                    name=art.name,
                    file_type=art.file_type,
                    size_bytes=art.size_bytes,
                    uploaded_by=art.uploaded_by,
                    uploaded_by_display=uploader_display,
                    created_at=art.created_at,
                    scope_level="software",
                    excluded_at_software=ex_sw,
                    excluded_at_project=None,
                )
            )

        combined.sort(key=lambda x: x.created_at, reverse=True)
        return combined

    async def _list_studio_scoped_rows(
        self, studio_id: UUID
    ) -> list[tuple[Artifact, str | None]]:
        r = await self.db.execute(
            select(Artifact, User.display_name)
            .where(
                Artifact.scope_level == "studio",
                Artifact.library_studio_id == studio_id,
            )
            .outerjoin(User, Artifact.uploaded_by == User.id)
            .order_by(Artifact.created_at.desc())
        )
        return list(r.all())

    async def list_artifacts_for_studio(self, studio_id: UUID) -> list[StudioArtifactRowOut]:
        acc: list[StudioArtifactRowOut] = []

        for art, uploader_display in await self._list_studio_scoped_rows(studio_id):
            acc.append(
                StudioArtifactRowOut(
                    id=art.id,
                    project_id=None,
                    project_name=None,
                    name=art.name,
                    file_type=art.file_type,
                    size_bytes=art.size_bytes,
                    uploaded_by=art.uploaded_by,
                    uploaded_by_display=uploader_display,
                    created_at=art.created_at,
                    scope_level="studio",
                    excluded_at_software=None,
                    excluded_at_project=None,
                    software_id=None,
                    software_name=None,
                )
            )

        sq = (
            select(Software.id, Software.name)
            .where(Software.studio_id == studio_id)
            .order_by(Software.name)
        )
        pairs = list((await self.db.execute(sq)).all())
        for sw_id, sw_name in pairs:
            for row in await self.list_artifacts_for_software(sw_id):
                acc.append(
                    StudioArtifactRowOut(
                        **row.model_dump(),
                        software_id=sw_id,
                        software_name=str(sw_name),
                    )
                )
        acc.sort(key=lambda x: x.created_at, reverse=True)
        return acc

    async def list_artifact_library_for_studio(
        self,
        studio_id: UUID,
        *,
        for_software_id: UUID | None = None,
        allowed_software_ids: frozenset[UUID] | None = None,
    ) -> list[StudioArtifactRowOut]:
        if allowed_software_ids is not None:
            acc: list[StudioArtifactRowOut] = []
            for sw_id in sorted(allowed_software_ids, key=lambda u: str(u)):
                if for_software_id is not None and sw_id != for_software_id:
                    continue
                sw_row = await self.db.get(Software, sw_id)
                if sw_row is None or sw_row.studio_id != studio_id:
                    continue
                sw_name = str(sw_row.name) if sw_row.name else ""
                for row in await self.list_artifacts_for_software(sw_id):
                    acc.append(
                        StudioArtifactRowOut(
                            **row.model_dump(),
                            software_id=sw_id,
                            software_name=sw_name,
                        )
                    )
            acc.sort(key=lambda x: x.created_at, reverse=True)
            return acc

        rows = await self.list_artifacts_for_studio(studio_id)
        if for_software_id is None:
            return rows
        filtered: list[StudioArtifactRowOut] = []
        for row in rows:
            if row.scope_level == "studio":
                filtered.append(row)
                continue
            if row.software_id == for_software_id:
                filtered.append(row)
        return filtered

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
