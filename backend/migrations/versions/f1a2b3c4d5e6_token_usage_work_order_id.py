"""Add work_order_id to token_usage."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "f1a2b3c4d5e6"
down_revision = "e7f8a9b0c1d2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "token_usage",
        sa.Column(
            "work_order_id",
            UUID(as_uuid=True),
            nullable=True,
        ),
    )
    op.create_foreign_key(
        "fk_token_usage_work_order_id",
        "token_usage",
        "work_orders",
        ["work_order_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_token_usage_work_order_created",
        "token_usage",
        ["work_order_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_token_usage_work_order_created", table_name="token_usage")
    op.drop_constraint("fk_token_usage_work_order_id", "token_usage", type_="foreignkey")
    op.drop_column("token_usage", "work_order_id")
