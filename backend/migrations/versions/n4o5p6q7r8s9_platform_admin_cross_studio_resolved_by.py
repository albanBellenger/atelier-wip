"""Rename is_tool_admin to is_platform_admin; add cross_studio_access.resolved_by_studio_id."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "n4o5p6q7r8s9"
down_revision = "m2n3o4p5q6r7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute('ALTER TABLE users RENAME COLUMN is_tool_admin TO is_platform_admin')
    op.add_column(
        "cross_studio_access",
        sa.Column("resolved_by_studio_id", UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_cross_studio_access_resolved_by_studio_id_studios",
        "cross_studio_access",
        "studios",
        ["resolved_by_studio_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_cross_studio_access_resolved_by_studio_id_studios",
        "cross_studio_access",
        type_="foreignkey",
    )
    op.drop_column("cross_studio_access", "resolved_by_studio_id")
    op.execute('ALTER TABLE users RENAME COLUMN is_platform_admin TO is_tool_admin')
