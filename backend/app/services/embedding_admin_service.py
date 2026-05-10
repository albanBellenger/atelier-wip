"""Admin embedding library overview + reindex policy."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import EmbeddingReindexPolicy, Studio
from app.schemas.admin_console import (
    AdminEmbeddingLibraryStudioResponse,
    EmbeddingReindexPolicyResponse,
    EmbeddingReindexPolicyUpdate,
)

from app.services.artifact_service import ArtifactService


class EmbeddingAdminService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_reindex_policy(self) -> EmbeddingReindexPolicyResponse:
        row = await self.db.get(EmbeddingReindexPolicy, 1)
        assert row is not None
        return EmbeddingReindexPolicyResponse.model_validate(row)

    async def patch_reindex_policy(
        self, body: EmbeddingReindexPolicyUpdate
    ) -> EmbeddingReindexPolicyResponse:
        row = await self.db.get(EmbeddingReindexPolicy, 1)
        assert row is not None
        data = body.model_dump(exclude_unset=True)
        for k, v in data.items():
            setattr(row, k, v)
        await self.db.flush()
        return EmbeddingReindexPolicyResponse.model_validate(row)

    async def library_overview(self) -> list[AdminEmbeddingLibraryStudioResponse]:
        art_svc = ArtifactService(self.db)
        studios = list(
            (await self.db.execute(select(Studio).order_by(Studio.name)))
            .scalars()
            .all()
        )
        out: list[AdminEmbeddingLibraryStudioResponse] = []
        for st in studios:
            stats = await art_svc.library_embedding_stats(st.id)
            out.append(
                AdminEmbeddingLibraryStudioResponse(
                    studio_id=st.id,
                    studio_name=st.name,
                    artifact_count=stats["artifact_count"],
                    embedded_artifact_count=stats["embedded_artifact_count"],
                    artifact_vector_chunks=stats["artifact_vector_chunks"],
                    section_vector_chunks=stats["section_vector_chunks"],
                )
            )
        return out
