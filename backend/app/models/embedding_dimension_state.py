"""Singleton row: last observed embedding vector width (matches pgvector columns)."""

from sqlalchemy import Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class EmbeddingDimensionState(Base):
    __tablename__ = "embedding_dimension_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    observed_dim: Mapped[int | None] = mapped_column(Integer, nullable=True)
