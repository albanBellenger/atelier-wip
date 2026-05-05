"""Tool-admin LLM provider registry, studio enablement, routing."""

from __future__ import annotations

import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class LlmProviderRegistry(Base):
    __tablename__ = "llm_provider_registry"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    provider_key: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    models_json: Mapped[str] = mapped_column(Text, nullable=False)
    api_base_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    logo_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    api_key: Mapped[str | None] = mapped_column(Text, nullable=True)


class StudioLlmProviderPolicy(Base):
    __tablename__ = "studio_llm_provider_policy"

    studio_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("studios.id", ondelete="CASCADE"), primary_key=True
    )
    provider_key: Mapped[str] = mapped_column(String(64), primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    selected_model: Mapped[str | None] = mapped_column(String(256), nullable=True)


class LlmRoutingRule(Base):
    __tablename__ = "llm_routing_rule"

    use_case: Mapped[str] = mapped_column(String(32), primary_key=True)
    primary_model: Mapped[str] = mapped_column(String(256), nullable=False)
    fallback_model: Mapped[str | None] = mapped_column(String(256), nullable=True)
