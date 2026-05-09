"""Drop display_name from llm_provider_registry (use provider_id as label)."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "s0t1u2v3w4x5"
down_revision = "q8r9s0t1u2v3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("llm_provider_registry", "display_name")


def downgrade() -> None:
    op.add_column(
        "llm_provider_registry",
        sa.Column(
            "display_name",
            sa.String(length=255),
            nullable=False,
            server_default="",
        ),
    )
    op.alter_column(
        "llm_provider_registry",
        "display_name",
        server_default=None,
    )
