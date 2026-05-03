"""Artifact chunking strategy for RAG."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "e1f2a3b4c5d6"
down_revision = "c1d2e3f4a5b6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "artifacts",
        sa.Column("chunking_strategy", sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("artifacts", "chunking_strategy")
