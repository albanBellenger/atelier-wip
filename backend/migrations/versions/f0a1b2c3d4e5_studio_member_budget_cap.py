"""Per-builder monthly spend cap (studio membership)."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "f0a1b2c3d4e5"
down_revision = "d6e7f8a9b0c1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "studio_members",
        sa.Column("budget_cap_monthly_usd", sa.Numeric(14, 2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("studio_members", "budget_cap_monthly_usd")
