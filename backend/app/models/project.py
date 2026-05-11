"""Projects, sections, and section embedding chunks."""

import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Index,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Project(Base):
    __tablename__ = "projects"
    __table_args__ = (
        UniqueConstraint(
            "software_id",
            "publish_folder_slug",
            name="uq_projects_software_publish_folder_slug",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    software_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("software.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    publish_folder_slug: Mapped[str] = mapped_column(String(128), nullable=False)
    archived: Mapped[bool] = mapped_column(
        Boolean, server_default="false", nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    last_published_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    software = relationship("Software", back_populates="projects")
    sections = relationship("Section", back_populates="project", cascade="all, delete-orphan")
    artifacts = relationship("Artifact", back_populates="project", cascade="all, delete-orphan")
    work_orders = relationship("WorkOrder", back_populates="project", cascade="all, delete-orphan")
    graph_edges = relationship("GraphEdge", back_populates="project", cascade="all, delete-orphan")
    chat_messages = relationship("ChatMessage", back_populates="project", cascade="all, delete-orphan")
    issues = relationship("Issue", back_populates="project", cascade="all, delete-orphan")
    artifact_exclusions = relationship(
        "ProjectArtifactExclusion",
        back_populates="project",
        cascade="all, delete-orphan",
    )


class Section(Base):
    __tablename__ = "sections"
    __table_args__ = (
        CheckConstraint(
            "(project_id IS NOT NULL AND software_id IS NULL) OR "
            "(project_id IS NULL AND software_id IS NOT NULL)",
            name="ck_sections_project_xor_software",
        ),
        Index(
            "uq_sections_project_id_slug",
            "project_id",
            "slug",
            unique=True,
            postgresql_where=text("project_id IS NOT NULL"),
        ),
        Index(
            "uq_sections_software_id_slug",
            "software_id",
            "slug",
            unique=True,
            postgresql_where=text("software_id IS NOT NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=True
    )
    software_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("software.id", ondelete="CASCADE"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    slug: Mapped[str] = mapped_column(String(256), nullable=False)
    order: Mapped[int] = mapped_column("order", Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, server_default="", nullable=False)
    yjs_state: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    last_edited_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    last_stale_notified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    project = relationship("Project", back_populates="sections")
    software = relationship("Software", back_populates="docs_sections")
    section_chunks = relationship("SectionChunk", back_populates="section", cascade="all, delete-orphan")
    private_threads = relationship("PrivateThread", back_populates="section", cascade="all, delete-orphan")
    work_orders = relationship(
        "WorkOrder",
        secondary="work_order_sections",
        back_populates="sections",
    )
    context_preferences = relationship(
        "SectionContextPreference",
        back_populates="section",
        cascade="all, delete-orphan",
    )


class SectionChunk(Base):
    __tablename__ = "section_chunks"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    section_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sections.id", ondelete="CASCADE"), nullable=False
    )
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list[float]] = mapped_column(Vector(1536), nullable=False)

    section = relationship("Section", back_populates="section_chunks")
