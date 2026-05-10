"""Drop unused embedding_model_registry table (embedding config lives on LLM provider registry)."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "v8w9x0y1z2a3"
down_revision = "u2v3w4x5y6z7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_table("embedding_model_registry")


def downgrade() -> None:
    op.create_table(
        "embedding_model_registry",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("model_id", sa.String(length=256), nullable=False),
        sa.Column("provider_name", sa.String(length=128), nullable=False),
        sa.Column("dim", sa.Integer(), nullable=False),
        sa.Column("cost_per_million_usd", sa.Numeric(precision=12, scale=6), nullable=True),
        sa.Column("region", sa.String(length=64), nullable=True),
        sa.Column("default_role", sa.String(length=32), nullable=True),
        sa.Column("litellm_provider_slug", sa.String(length=64), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("model_id", name="uq_embedding_model_registry_model_id"),
    )
