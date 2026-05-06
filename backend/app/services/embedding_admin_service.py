"""Admin CRUD for embedding catalog + reindex policy."""

from __future__ import annotations

import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import EmbeddingModelRegistry, EmbeddingReindexPolicy, Studio
from app.schemas.admin_console import (
    AdminEmbeddingLibraryStudioResponse,
    EmbeddingModelRegistryResponse,
    EmbeddingModelRegistryUpdate,
    EmbeddingReindexPolicyResponse,
    EmbeddingReindexPolicyUpdate,
)


from app.services.artifact_service import ArtifactService


class EmbeddingAdminService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list_models(self) -> list[EmbeddingModelRegistryResponse]:
        rows = (
            (await self.db.execute(select(EmbeddingModelRegistry).order_by(EmbeddingModelRegistry.model_id)))
            .scalars()
            .all()
        )
        return [EmbeddingModelRegistryResponse.model_validate(r) for r in rows]

    async def upsert_model(
        self, body: EmbeddingModelRegistryUpdate, model_id: str | None = None
    ) -> EmbeddingModelRegistryResponse:
        mid = model_id or body.model_id
        existing = await self.db.scalar(
            select(EmbeddingModelRegistry).where(EmbeddingModelRegistry.model_id == mid)
        )
        if existing:
            existing.provider_name = body.provider_name
            existing.dim = body.dim
            existing.cost_per_million_usd = body.cost_per_million_usd
            existing.region = body.region
            existing.default_role = body.default_role
            if "litellm_provider_slug" in body.model_fields_set:
                raw_slug = body.litellm_provider_slug
                existing.litellm_provider_slug = (
                    None if raw_slug is None else (str(raw_slug).strip() or None)
                )
            await self.db.flush()
            return EmbeddingModelRegistryResponse.model_validate(existing)
        slug_val: str | None = None
        if "litellm_provider_slug" in body.model_fields_set:
            raw_slug = body.litellm_provider_slug
            slug_val = None if raw_slug is None else (str(raw_slug).strip() or None)
        row = EmbeddingModelRegistry(
            id=uuid.uuid4(),
            model_id=mid.strip(),
            provider_name=body.provider_name,
            dim=body.dim,
            cost_per_million_usd=body.cost_per_million_usd,
            region=body.region,
            default_role=body.default_role,
            litellm_provider_slug=slug_val,
        )
        self.db.add(row)
        await self.db.flush()
        return EmbeddingModelRegistryResponse.model_validate(row)

    async def delete_model(self, model_id: str) -> None:
        await self.db.execute(
            delete(EmbeddingModelRegistry).where(EmbeddingModelRegistry.model_id == model_id)
        )
        await self.db.flush()

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
