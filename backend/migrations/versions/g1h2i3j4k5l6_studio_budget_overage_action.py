"""Per-studio policy when monthly spend cap is exceeded."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "g1h2i3j4k5l6"
down_revision = "f0a1b2c3d4e5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "studios",
        sa.Column(
            "budget_overage_action",
            sa.String(64),
            nullable=False,
            server_default="pause_generations",
        ),
    )


def downgrade() -> None:
    op.drop_column("studios", "budget_overage_action")
