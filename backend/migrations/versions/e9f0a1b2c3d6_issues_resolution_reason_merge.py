"""Merge migration + issues.resolution_reason for doc sync resolution tracking."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e9f0a1b2c3d6"
down_revision: Union[str, Sequence[str], None] = ("d6e7f8a9b0c1", "d0e1f2a3b4c5")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "issues",
        sa.Column("resolution_reason", sa.String(length=64), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("issues", "resolution_reason")
