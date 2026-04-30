"""Singleton LLM / embedding configuration (Tool Admin)."""

from sqlalchemy import Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AdminConfig(Base):
    __tablename__ = "admin_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    llm_provider: Mapped[str | None] = mapped_column(String(64), nullable=True)
    llm_model: Mapped[str | None] = mapped_column(String(256), nullable=True)
    llm_api_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    llm_api_base_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    embedding_provider: Mapped[str | None] = mapped_column(String(64), nullable=True)
    embedding_model: Mapped[str | None] = mapped_column(String(256), nullable=True)
    embedding_api_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    embedding_api_base_url: Mapped[str | None] = mapped_column(Text, nullable=True)
