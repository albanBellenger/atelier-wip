"""Artifact CRUD and storage."""

from __future__ import annotations

import re
import uuid
from uuid import UUID

from sqlalchemy import and_, delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ApiError
from app.models import Artifact, ArtifactChunk, Project, Software, User
from app.models.artifact_exclusion import (
    ProjectArtifactExclusion,
    SoftwareArtifactExclusion,
)
from app.schemas.artifact import (
    ArtifactDetailResponse,
    ArtifactScopeLevel,
    ChunkPreview,
    SoftwareArtifactRowOut,
    StudioArtifactRowOut,
)
from app.services.artifact_chunking import validate_chunking_strategy
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


def _embedding_row_fields(art: Artifact) -> dict[str, object]:
    return {
        "embedding_status": art.embedding_status,
        "embedded_at": art.embedded_at,
        "chunk_count": art.chunk_count,
        "extracted_char_count": art.extracted_char_count,
        "chunking_strategy": art.chunking_strategy,
    }


class ArtifactService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_by_id(self, artifact_id: UUID) -> Artifact | None:
        return await self.db.get(Artifact, artifact_id)

    async def build_artifact_detail(
        self,
        art: Artifact,
        *,
        include_chunk_previews: bool,
    ) -> ArtifactDetailResponse:
        previews: list[ChunkPreview] = []
        if include_chunk_previews:
            r = await self.db.execute(
                select(ArtifactChunk)
                .where(ArtifactChunk.artifact_id == art.id)
                .order_by(ArtifactChunk.chunk_index)
                .limit(3)
            )
            for ch in r.scalars().all():
                full = ch.content
                truncated = full if len(full) <= 400 else full[:400]
                previews.append(
                    ChunkPreview(
                        chunk_index=ch.chunk_index,
                        content=truncated,
                        content_length=len(full),
                    )
                )
        context_studio_id = await self.resolve_context_studio_id(art)
        context_software_id = await self.resolve_context_software_id(art)
        return ArtifactDetailResponse(
            id=art.id,
            project_id=art.project_id,
            scope_level=self._row_scope_level(art),
            context_studio_id=context_studio_id,
            context_software_id=context_software_id,
            name=art.name,
            file_type=art.file_type,
            size_bytes=art.size_bytes,
            uploaded_by=art.uploaded_by,
            created_at=art.created_at,
            chunking_strategy=art.chunking_strategy,
            embedding_status=art.embedding_status,  # type: ignore[arg-type]
            embedded_at=art.embedded_at,
            chunk_count=art.chunk_count,
            extracted_char_count=art.extracted_char_count,
            embedding_error=art.embedding_error,
            chunk_previews=previews,
        )

    async def resolve_context_studio_id(self, art: Artifact) -> UUID:
        """Studio that owns this artifact (for RBAC and scope moves)."""
        sl = art.scope_level or "project"
        if sl == "studio":
            if art.library_studio_id is None:
                raise ApiError(
                    status_code=404,
                    code="NOT_FOUND",
                    message="Artifact not found.",
                )
            return art.library_studio_id
        if sl == "software":
            if art.library_software_id is None:
                raise ApiError(
                    status_code=404,
                    code="NOT_FOUND",
                    message="Artifact not found.",
                )
            sw = await self.db.get(Software, art.library_software_id)
            if sw is None:
                raise ApiError(
                    status_code=404,
                    code="NOT_FOUND",
                    message="Software not found.",
                )
            return sw.studio_id
        if art.project_id is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Artifact not found.",
            )
        proj = await self.db.get(Project, art.project_id)
        if proj is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Project not found.",
            )
        sw = await self.db.get(Software, proj.software_id)
        if sw is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Software not found.",
            )
        return sw.studio_id

    async def resolve_context_software_id(self, art: Artifact) -> UUID | None:
        sl = art.scope_level or "project"
        if sl == "studio":
            return None
        if sl == "software":
            return art.library_software_id
        if art.project_id is None:
            return None
        proj = await self.db.get(Project, art.project_id)
        if proj is None:
            return None
        return proj.software_id

    async def get_artifact_detail_for_project(
        self,
        project_id: UUID,
        artifact_id: UUID,
        *,
        include_chunk_previews: bool,
    ) -> ArtifactDetailResponse:
        art = await self.get_in_project(project_id, artifact_id)
        return await self.build_artifact_detail(
            art, include_chunk_previews=include_chunk_previews
        )

    async def get_artifact_detail_by_id(
        self,
        artifact_id: UUID,
        *,
        include_chunk_previews: bool,
    ) -> ArtifactDetailResponse:
        art = await self.get_by_id(artifact_id)
        if art is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Artifact not found.",
            )
        return await self.build_artifact_detail(
            art, include_chunk_previews=include_chunk_previews
        )

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
                    **_embedding_row_fields(art),
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
                    **_embedding_row_fields(art),
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
                    **_embedding_row_fields(art),
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

    async def delete_by_id(self, artifact_id: UUID) -> str:
        art = await self.db.get(Artifact, artifact_id)
        if art is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Artifact not found.",
            )
        path = art.storage_path
        await self.db.delete(art)
        await self.db.flush()
        return path

    async def change_artifact_scope(
        self,
        artifact_id: UUID,
        *,
        scope_level: ArtifactScopeLevel,
        software_id: UUID | None,
        project_id: UUID | None,
    ) -> Artifact:
        """Move blob + row between studio / software / project scopes within one studio."""
        from app.storage.minio_storage import get_storage_client

        art = await self.db.get(Artifact, artifact_id)
        if art is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Artifact not found.",
            )

        home_studio_id = await self.resolve_context_studio_id(art)

        target_sw: UUID | None = None
        target_proj: UUID | None = None

        if scope_level == "studio":
            if software_id is not None or project_id is not None:
                raise ApiError(
                    status_code=422,
                    code="INVALID_SCOPE_PAYLOAD",
                    message="studio scope must not include software_id or project_id.",
                )
        elif scope_level == "software":
            if software_id is None:
                raise ApiError(
                    status_code=422,
                    code="INVALID_SCOPE_PAYLOAD",
                    message="software_id is required for software scope.",
                )
            if project_id is not None:
                raise ApiError(
                    status_code=422,
                    code="INVALID_SCOPE_PAYLOAD",
                    message="project_id must not be set for software scope.",
                )
            sw_row = await self.db.get(Software, software_id)
            if sw_row is None:
                raise ApiError(
                    status_code=404,
                    code="NOT_FOUND",
                    message="Software not found.",
                )
            if sw_row.studio_id != home_studio_id:
                raise ApiError(
                    status_code=422,
                    code="INVALID_SCOPE_TARGET",
                    message="Software must belong to the artifact's studio.",
                )
            target_sw = software_id
        else:
            if project_id is None:
                raise ApiError(
                    status_code=422,
                    code="INVALID_SCOPE_PAYLOAD",
                    message="project_id is required for project scope.",
                )
            proj_row = await self.db.get(Project, project_id)
            if proj_row is None:
                raise ApiError(
                    status_code=404,
                    code="NOT_FOUND",
                    message="Project not found.",
                )
            sw_row = await self.db.get(Software, proj_row.software_id)
            if sw_row is None or sw_row.studio_id != home_studio_id:
                raise ApiError(
                    status_code=422,
                    code="INVALID_SCOPE_TARGET",
                    message="Project must belong to the artifact's studio.",
                )
            target_proj = project_id

        sl = art.scope_level or "project"
        if sl == scope_level:
            if scope_level == "studio":
                if (
                    art.library_studio_id == home_studio_id
                    and art.project_id is None
                    and art.library_software_id is None
                ):
                    return art
            elif scope_level == "software":
                if (
                    art.library_software_id == target_sw
                    and art.project_id is None
                ):
                    return art
            elif art.project_id == target_proj:
                return art

        basename = art.storage_path.rsplit("/", 1)[-1]
        if scope_level == "studio":
            new_path = f"studio/{home_studio_id}/{art.id}/{basename}"
        elif scope_level == "software":
            assert target_sw is not None
            new_path = f"software/{target_sw}/{art.id}/{basename}"
        else:
            assert target_proj is not None
            new_path = f"{target_proj}/{art.id}/{basename}"

        old_path = art.storage_path
        if old_path == new_path:
            return art

        storage = get_storage_client()
        try:
            await storage.copy_object(new_path, old_path)
        except Exception as exc:
            raise ApiError(
                status_code=502,
                code="STORAGE_ERROR",
                message="Could not move file in storage.",
            ) from exc

        if scope_level == "studio":
            art.scope_level = "studio"
            art.project_id = None
            art.library_studio_id = home_studio_id
            art.library_software_id = None
        elif scope_level == "software":
            assert target_sw is not None
            art.scope_level = "software"
            art.project_id = None
            art.library_studio_id = home_studio_id
            art.library_software_id = target_sw
        else:
            assert target_proj is not None
            art.scope_level = "project"
            art.project_id = target_proj
            art.library_studio_id = None
            art.library_software_id = None

        art.storage_path = new_path

        await self.db.execute(
            delete(SoftwareArtifactExclusion).where(
                SoftwareArtifactExclusion.artifact_id == artifact_id
            )
        )
        await self.db.execute(
            delete(ProjectArtifactExclusion).where(
                ProjectArtifactExclusion.artifact_id == artifact_id
            )
        )
        await self.db.flush()

        try:
            await storage.remove(old_path)
        except Exception:
            pass

        return art

    async def set_chunking_strategy(
        self,
        artifact_id: UUID,
        chunking_strategy: str | None,
    ) -> Artifact:
        art = await self.db.get(Artifact, artifact_id)
        if art is None:
            raise ApiError(
                status_code=404,
                code="NOT_FOUND",
                message="Artifact not found.",
            )
        art.chunking_strategy = validate_chunking_strategy(chunking_strategy)
        await self.db.flush()
        return art

    async def delete(self, project_id: UUID, artifact_id: UUID) -> str:
        art = await self.get_in_project(project_id, artifact_id)
        path = art.storage_path
        await self.db.delete(art)
        await self.db.flush()
        return path
