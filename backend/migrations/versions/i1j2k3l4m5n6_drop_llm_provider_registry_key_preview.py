"""Remove key_preview from LLM provider registry (unused metadata)."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "i1j2k3l4m5n6"
down_revision = "h1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("llm_provider_registry", "key_preview")


def downgrade() -> None:
    op.add_column(
        "llm_provider_registry",
        sa.Column("key_preview", sa.String(length=64), nullable=True),
    )
