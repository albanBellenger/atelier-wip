"""add embedding_dim admin_config and phase_order work_orders

Revision ID: 8207a06bca45
Revises: a1b2c3d4e5f6
Create Date: 2026-04-30 11:32:00.414846

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8207a06bca45'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "admin_config",
        sa.Column("embedding_dim", sa.Integer(), nullable=True),
    )
    op.add_column(
        "work_orders",
        sa.Column("phase_order", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("work_orders", "phase_order")
    op.drop_column("admin_config", "embedding_dim")
