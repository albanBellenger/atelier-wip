"""Tool admin configuration for LLM and embedding providers."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AdminConfig
from app.schemas.auth import AdminConfigResponse, AdminConfigUpdate


def _mask(s: str | None) -> bool:
    return bool(s and s.strip())


class AdminService:
    """CRUD for singleton `admin_config` row (id=1)."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_or_create(self) -> AdminConfig:
        row = await self.db.get(AdminConfig, 1)
        if row is None:
            row = AdminConfig(id=1)
            self.db.add(row)
            await self.db.flush()
        return row

    async def get_public(self) -> AdminConfigResponse:
        row = await self.get_or_create()
        return AdminConfigResponse(
            llm_provider=row.llm_provider,
            llm_model=row.llm_model,
            llm_api_key_set=_mask(row.llm_api_key),
            embedding_provider=row.embedding_provider,
            embedding_model=row.embedding_model,
            embedding_api_key_set=_mask(row.embedding_api_key),
        )

    async def update(self, body: AdminConfigUpdate) -> AdminConfigResponse:
        row = await self.get_or_create()
        data = body.model_dump(exclude_unset=True)
        for key, value in data.items():
            setattr(row, key, value)
        await self.db.flush()
        return await self.get_public()
