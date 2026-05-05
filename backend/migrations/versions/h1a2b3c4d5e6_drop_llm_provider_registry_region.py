"""Remove region from LLM provider registry (redundant with API base / policy)."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "h1a2b3c4d5e6"
down_revision = "g1h2i3j4k5l6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("llm_provider_registry", "region")


def downgrade() -> None:
    op.add_column(
        "llm_provider_registry",
        sa.Column("region", sa.String(length=64), nullable=True),
    )
