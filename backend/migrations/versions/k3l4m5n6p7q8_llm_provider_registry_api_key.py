"""Add encrypted api_key to llm_provider_registry."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "k3l4m5n6p7q8"
down_revision = "j2k3l4m5n6p7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "llm_provider_registry",
        sa.Column("api_key", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("llm_provider_registry", "api_key")
