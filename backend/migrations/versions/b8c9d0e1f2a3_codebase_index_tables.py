"""Codebase snapshot index: snapshots, files, chunks (HNSW), symbols."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects.postgresql import UUID

revision: str = "b8c9d0e1f2a3"
down_revision: Union[str, Sequence[str], None] = "z9a8b7c6d5e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "codebase_snapshots",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "software_id",
            UUID(as_uuid=True),
            sa.ForeignKey("software.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("commit_sha", sa.String(length=64), nullable=False),
        sa.Column("branch", sa.String(length=255), nullable=False),
        sa.Column(
            "status",
            sa.String(length=16),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("ready_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "triggered_by_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_codebase_snapshots_software_id_status",
        "codebase_snapshots",
        ["software_id", "status"],
    )

    op.create_table(
        "codebase_files",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "snapshot_id",
            UUID(as_uuid=True),
            sa.ForeignKey("codebase_snapshots.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("path", sa.Text(), nullable=False),
        sa.Column("blob_sha", sa.String(length=64), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("language", sa.String(length=32), nullable=True),
        sa.UniqueConstraint(
            "snapshot_id",
            "path",
            name="uq_codebase_files_snapshot_path",
        ),
    )
    op.create_index(
        "ix_codebase_files_snapshot_id",
        "codebase_files",
        ["snapshot_id"],
    )

    op.create_table(
        "codebase_chunks",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "snapshot_id",
            UUID(as_uuid=True),
            sa.ForeignKey("codebase_snapshots.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "file_id",
            UUID(as_uuid=True),
            sa.ForeignKey("codebase_files.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(1536), nullable=False),
        sa.Column("start_line", sa.Integer(), nullable=True),
        sa.Column("end_line", sa.Integer(), nullable=True),
    )
    op.create_index(
        "ix_codebase_chunks_snapshot_id",
        "codebase_chunks",
        ["snapshot_id"],
    )
    op.create_index(
        "ix_codebase_chunks_file_id",
        "codebase_chunks",
        ["file_id"],
    )
    op.execute(
        "CREATE INDEX ix_codebase_chunks_embedding_hnsw ON codebase_chunks "
        "USING hnsw (embedding vector_cosine_ops)"
    )

    op.create_table(
        "codebase_symbols",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "snapshot_id",
            UUID(as_uuid=True),
            sa.ForeignKey("codebase_snapshots.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "file_id",
            UUID(as_uuid=True),
            sa.ForeignKey("codebase_files.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("start_line", sa.Integer(), nullable=False),
        sa.Column("end_line", sa.Integer(), nullable=False),
    )
    op.create_index(
        "ix_codebase_symbols_snapshot_id",
        "codebase_symbols",
        ["snapshot_id"],
    )
    op.create_index(
        "ix_codebase_symbols_file_id",
        "codebase_symbols",
        ["file_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_codebase_symbols_file_id", table_name="codebase_symbols")
    op.drop_index("ix_codebase_symbols_snapshot_id", table_name="codebase_symbols")
    op.drop_table("codebase_symbols")

    op.execute("DROP INDEX IF EXISTS ix_codebase_chunks_embedding_hnsw")
    op.drop_index("ix_codebase_chunks_file_id", table_name="codebase_chunks")
    op.drop_index("ix_codebase_chunks_snapshot_id", table_name="codebase_chunks")
    op.drop_table("codebase_chunks")

    op.drop_index("ix_codebase_files_snapshot_id", table_name="codebase_files")
    op.drop_table("codebase_files")

    op.drop_index(
        "ix_codebase_snapshots_software_id_status",
        table_name="codebase_snapshots",
    )
    op.drop_table("codebase_snapshots")
