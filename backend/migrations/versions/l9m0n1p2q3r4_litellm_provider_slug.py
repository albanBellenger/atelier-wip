"""Add litellm_provider_slug to LLM and embedding registries."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "l9m0n1p2q3r4"
down_revision = "k3l4m5n6p7q8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "llm_provider_registry",
        sa.Column("litellm_provider_slug", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "embedding_model_registry",
        sa.Column("litellm_provider_slug", sa.String(length=64), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("embedding_model_registry", "litellm_provider_slug")
    op.drop_column("llm_provider_registry", "litellm_provider_slug")
