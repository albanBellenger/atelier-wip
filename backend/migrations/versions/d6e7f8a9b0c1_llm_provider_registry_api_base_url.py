"""LLM provider registry: optional API base URL per row."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "d6e7f8a9b0c1"
down_revision = "c5d6e7f8a9b0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "llm_provider_registry",
        sa.Column("api_base_url", sa.String(length=512), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("llm_provider_registry", "api_base_url")
