"""Tool admin configuration for LLM and embedding providers."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AdminConfig
from app.schemas.auth import AdminConfigPublic, AdminConfigUpdate


def _mask(s: str | None) -> bool:
    return bool(s and s.strip())


class AdminService:
    """CRUD for singleton `admin_config` row (id=1)."""

    @staticmethod
    async def get_or_create(session: AsyncSession) -> AdminConfig:
        row = await session.get(AdminConfig, 1)
        if row is None:
            row = AdminConfig(id=1)
            session.add(row)
            await session.flush()
        return row

    @staticmethod
    async def get_public(session: AsyncSession) -> AdminConfigPublic:
        row = await AdminService.get_or_create(session)
        return AdminConfigPublic(
            llm_provider=row.llm_provider,
            llm_model=row.llm_model,
            llm_api_key_set=_mask(row.llm_api_key),
            embedding_provider=row.embedding_provider,
            embedding_model=row.embedding_model,
            embedding_api_key_set=_mask(row.embedding_api_key),
        )

    @staticmethod
    async def update(session: AsyncSession, body: AdminConfigUpdate) -> AdminConfigPublic:
        row = await AdminService.get_or_create(session)
        data = body.model_dump(exclude_unset=True)
        for key, value in data.items():
            setattr(row, key, value)
        await session.flush()
        return await AdminService.get_public(session)
