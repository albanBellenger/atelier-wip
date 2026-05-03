"""Project last_published_at, section last editor and stale notify markers."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "f2a3b4c5d6e7"
down_revision = "e1f2a3b4c5d6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column("last_published_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "sections",
        sa.Column("last_edited_by_id", UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "sections",
        sa.Column("last_stale_notified_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_sections_last_edited_by_id_users",
        "sections",
        "users",
        ["last_edited_by_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_sections_last_edited_by_id_users", "sections", type_="foreignkey")
    op.drop_column("sections", "last_stale_notified_at")
    op.drop_column("sections", "last_edited_by_id")
    op.drop_column("projects", "last_published_at")
