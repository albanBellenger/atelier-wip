"""Sections: nullable project_id, software_id for Software Docs; partial unique indexes."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "z9a8b7c6d5e4"
down_revision: Union[str, Sequence[str], None] = "v8w9x0y1z2a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("uq_sections_project_slug", "sections", type_="unique")
    op.alter_column(
        "sections",
        "project_id",
        existing_type=UUID(as_uuid=True),
        nullable=True,
    )
    op.add_column(
        "sections",
        sa.Column("software_id", UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_sections_software_id_software",
        "sections",
        "software",
        ["software_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_check_constraint(
        "ck_sections_project_xor_software",
        "sections",
        sa.text(
            "(project_id IS NOT NULL AND software_id IS NULL) OR "
            "(project_id IS NULL AND software_id IS NOT NULL)"
        ),
    )
    op.execute(
        "CREATE UNIQUE INDEX uq_sections_project_id_slug "
        "ON sections (project_id, slug) WHERE project_id IS NOT NULL"
    )
    op.execute(
        "CREATE UNIQUE INDEX uq_sections_software_id_slug "
        "ON sections (software_id, slug) WHERE software_id IS NOT NULL"
    )
    op.execute(
        "CREATE INDEX ix_sections_software_order "
        "ON sections (software_id, \"order\") WHERE software_id IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_sections_software_order")
    op.execute("DROP INDEX IF EXISTS uq_sections_software_id_slug")
    op.execute("DROP INDEX IF EXISTS uq_sections_project_id_slug")
    op.drop_constraint("ck_sections_project_xor_software", "sections", type_="check")
    op.drop_constraint("fk_sections_software_id_software", "sections", type_="foreignkey")
    op.drop_column("sections", "software_id")
    op.alter_column(
        "sections",
        "project_id",
        existing_type=UUID(as_uuid=True),
        nullable=False,
    )
    op.create_unique_constraint(
        "uq_sections_project_slug",
        "sections",
        ["project_id", "slug"],
    )
