"""Phase 1: artifact embedding status for RAG visibility."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "c1d2e3f4a5b6"
down_revision = "b9c0d1e2f3a4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "artifacts",
        sa.Column(
            "embedding_status",
            sa.String(length=16),
            server_default="pending",
            nullable=False,
        ),
    )
    op.add_column(
        "artifacts",
        sa.Column("embedded_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "artifacts",
        sa.Column("extracted_char_count", sa.Integer(), nullable=True),
    )
    op.add_column(
        "artifacts",
        sa.Column("chunk_count", sa.Integer(), nullable=True),
    )
    op.add_column(
        "artifacts",
        sa.Column("embedding_error", sa.Text(), nullable=True),
    )
    op.create_index(
        "ix_artifacts_embedding_status",
        "artifacts",
        ["embedding_status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_artifacts_embedding_status", table_name="artifacts")
    op.drop_column("artifacts", "embedding_error")
    op.drop_column("artifacts", "chunk_count")
    op.drop_column("artifacts", "extracted_char_count")
    op.drop_column("artifacts", "embedded_at")
    op.drop_column("artifacts", "embedding_status")
