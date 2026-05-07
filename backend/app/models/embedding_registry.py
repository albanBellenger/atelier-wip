"""Embedding model catalog and reindex policy (platform admin)."""

import uuid
from decimal import Decimal

from sqlalchemy import Integer, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class EmbeddingModelRegistry(Base):
    __tablename__ = "embedding_model_registry"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    model_id: Mapped[str] = mapped_column(String(256), unique=True, nullable=False)
    provider_name: Mapped[str] = mapped_column(String(128), nullable=False)
    dim: Mapped[int] = mapped_column(Integer, nullable=False)
    cost_per_million_usd: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 6), nullable=True
    )
    region: Mapped[str | None] = mapped_column(String(64), nullable=True)
    default_role: Mapped[str | None] = mapped_column(String(32), nullable=True)
    litellm_provider_slug: Mapped[str | None] = mapped_column(String(64), nullable=True)


class EmbeddingReindexPolicy(Base):
    __tablename__ = "embedding_reindex_policy"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    auto_reindex_trigger: Mapped[str] = mapped_column(String(64), nullable=False)
    debounce_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    drift_threshold_pct: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    retention_days: Mapped[int] = mapped_column(Integer, nullable=False)
