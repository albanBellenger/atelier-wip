"""issues origin + run_actor for Slice 11 visibility."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "c7f9e2a1b4d8"
down_revision: Union[str, Sequence[str], None] = "8207a06bca45"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "issues",
        sa.Column(
            "origin",
            sa.String(length=16),
            server_default="manual",
            nullable=False,
        ),
    )
    op.add_column(
        "issues",
        sa.Column("run_actor_id", UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_issues_run_actor_id_users",
        "issues",
        "users",
        ["run_actor_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_issues_run_actor_id_users", "issues", type_="foreignkey")
    op.drop_column("issues", "run_actor_id")
    op.drop_column("issues", "origin")
