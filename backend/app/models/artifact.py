"""Uploaded artifacts (project, software, or studio scope) and embedding chunks."""

import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Artifact(Base):
    __tablename__ = "artifacts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=True
    )
    scope_level: Mapped[str] = mapped_column(
        String(16), server_default="project", nullable=False
    )
    library_studio_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("studios.id", ondelete="CASCADE"), nullable=True
    )
    library_software_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("software.id", ondelete="CASCADE"), nullable=True
    )
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(512), nullable=False)
    file_type: Mapped[str] = mapped_column(String(8), nullable=False)  # pdf | md
    size_bytes: Mapped[int] = mapped_column(Integer, server_default="0", nullable=False)
    storage_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    embedding_status: Mapped[str] = mapped_column(
        String(16), server_default="pending", nullable=False
    )
    embedded_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    extracted_char_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    chunk_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    embedding_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    chunking_strategy: Mapped[str | None] = mapped_column(String(32), nullable=True)

    project = relationship("Project", back_populates="artifacts")
    library_studio = relationship("Studio", foreign_keys=[library_studio_id])
    library_software = relationship("Software", foreign_keys=[library_software_id])
    chunks = relationship("ArtifactChunk", back_populates="artifact", cascade="all, delete-orphan")
    software_exclusions = relationship(
        "SoftwareArtifactExclusion",
        back_populates="artifact",
        cascade="all, delete-orphan",
    )
    project_exclusions = relationship(
        "ProjectArtifactExclusion",
        back_populates="artifact",
        cascade="all, delete-orphan",
    )


class ArtifactChunk(Base):
    __tablename__ = "artifact_chunks"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    artifact_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("artifacts.id", ondelete="CASCADE"), nullable=False
    )
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list[float]] = mapped_column(Vector(1536), nullable=False)

    artifact = relationship("Artifact", back_populates="chunks")
