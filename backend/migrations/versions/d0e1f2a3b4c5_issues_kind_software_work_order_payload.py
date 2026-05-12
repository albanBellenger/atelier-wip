"""Issues: kind, optional project_id, software_id, work_order_id, payload_json."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.postgresql import UUID

revision: str = "d0e1f2a3b4c5"
down_revision: Union[str, Sequence[str], None] = "b8c9d0e1f2a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "issues",
        sa.Column(
            "kind",
            sa.String(length=32),
            server_default="conflict_or_gap",
            nullable=False,
        ),
    )
    op.add_column(
        "issues",
        sa.Column(
            "software_id",
            UUID(as_uuid=True),
            nullable=True,
        ),
    )
    op.create_foreign_key(
        "fk_issues_software_id_software",
        "issues",
        "software",
        ["software_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.add_column(
        "issues",
        sa.Column(
            "work_order_id",
            UUID(as_uuid=True),
            nullable=True,
        ),
    )
    op.create_foreign_key(
        "fk_issues_work_order_id_work_orders",
        "issues",
        "work_orders",
        ["work_order_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.add_column(
        "issues",
        sa.Column("payload_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.alter_column("issues", "project_id", existing_type=UUID(as_uuid=True), nullable=True)
    op.execute(
        sa.text(
            """
            UPDATE issues AS i
            SET software_id = p.software_id
            FROM projects AS p
            WHERE i.project_id = p.id AND i.software_id IS NULL
            """
        )
    )
    op.create_check_constraint(
        "ck_issues_project_or_software",
        "issues",
        "project_id IS NOT NULL OR software_id IS NOT NULL",
    )
    op.create_index("ix_issues_kind_status", "issues", ["kind", "status"], unique=False)


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM issues WHERE project_id IS NULL"))
    op.drop_index("ix_issues_kind_status", table_name="issues")
    op.drop_constraint("ck_issues_project_or_software", "issues", type_="check")
    op.alter_column("issues", "project_id", existing_type=UUID(as_uuid=True), nullable=False)
    op.drop_constraint("fk_issues_work_order_id_work_orders", "issues", type_="foreignkey")
    op.drop_column("issues", "work_order_id")
    op.drop_constraint("fk_issues_software_id_software", "issues", type_="foreignkey")
    op.drop_column("issues", "software_id")
    op.drop_column("issues", "payload_json")
    op.drop_column("issues", "kind")
