"""work_orders.updated_by_id for attention / last editor

Revision ID: b1c2d3e4f5a6
Revises: f9a1b2c3d4e5
Create Date: 2026-05-01 20:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "b1c2d3e4f5a6"
down_revision: Union[str, Sequence[str], None] = "f9a1b2c3d4e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "work_orders",
        sa.Column("updated_by_id", UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_work_orders_updated_by_id_users",
        "work_orders",
        "users",
        ["updated_by_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_work_orders_updated_by_id_users",
        "work_orders",
        type_="foreignkey",
    )
    op.drop_column("work_orders", "updated_by_id")
