"""Software product within a studio."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Software(Base):
    __tablename__ = "software"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    studio_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("studios.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    definition: Mapped[str | None] = mapped_column(Text, nullable=True)
    git_provider: Mapped[str | None] = mapped_column(String(32), server_default="gitlab")
    git_repo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    git_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    git_branch: Mapped[str | None] = mapped_column(String(255), server_default="main")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    studio = relationship("Studio", back_populates="software_list")
    projects = relationship("Project", back_populates="software", cascade="all, delete-orphan")
    activity_events = relationship(
        "SoftwareActivityEvent",
        back_populates="software",
        cascade="all, delete-orphan",
    )
