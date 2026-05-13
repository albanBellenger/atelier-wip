"""CHECK constraint on studio_members.role (FR home-studio roles).

Revision ID: w1x2y3z4a5b7
Revises: e9f0a1b2c3d6
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "w1x2y3z4a5b7"
down_revision: Union[str, Sequence[str], None] = "e9f0a1b2c3d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_check_constraint(
        "ck_studio_members_role_allowed",
        "studio_members",
        sa.text("role IN ('studio_admin', 'studio_member', 'studio_viewer')"),
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_studio_members_role_allowed",
        "studio_members",
        type_="check",
    )
