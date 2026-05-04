"""Studios and membership."""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Studio(Base):
    __tablename__ = "studios"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    logo_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    budget_cap_monthly_usd: Mapped[Decimal | None] = mapped_column(
        Numeric(14, 2), nullable=True
    )
    budget_overage_action: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        server_default="pause_generations",
        default="pause_generations",
    )
    git_provider: Mapped[str | None] = mapped_column(String(32), nullable=True)
    git_repo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    git_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    git_branch: Mapped[str | None] = mapped_column(String(255), nullable=True)
    git_publish_strategy: Mapped[str | None] = mapped_column(String(64), nullable=True)

    members = relationship("StudioMember", back_populates="studio", cascade="all, delete-orphan")
    software_list = relationship("Software", back_populates="studio", cascade="all, delete-orphan")
    mcp_keys = relationship("McpKey", back_populates="studio", cascade="all, delete-orphan")


class StudioMember(Base):
    __tablename__ = "studio_members"

    studio_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("studios.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), primary_key=True
    )
    role: Mapped[str] = mapped_column(String(32), nullable=False)  # studio_admin | studio_member
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    budget_cap_monthly_usd: Mapped[Decimal | None] = mapped_column(
        Numeric(14, 2), nullable=True
    )

    studio = relationship("Studio", back_populates="members")
    user = relationship("User", back_populates="studio_memberships")
