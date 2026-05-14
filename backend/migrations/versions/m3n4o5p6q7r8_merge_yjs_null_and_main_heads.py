"""Merge alembic heads a1m2k3d4n5p6 and f1e9d8c7b6a5."""

from __future__ import annotations

from typing import Sequence, Union

revision: str = "m3n4o5p6q7r8"
down_revision: Union[str, Sequence[str], None] = ("a1m2k3d4n5p6", "f1e9d8c7b6a5")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
