"""Platform-admin embedding reindex policy (singleton row)."""

from decimal import Decimal

from sqlalchemy import Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class EmbeddingReindexPolicy(Base):
    __tablename__ = "embedding_reindex_policy"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    auto_reindex_trigger: Mapped[str] = mapped_column(String(64), nullable=False)
    debounce_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    drift_threshold_pct: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    retention_days: Mapped[int] = mapped_column(Integer, nullable=False)
