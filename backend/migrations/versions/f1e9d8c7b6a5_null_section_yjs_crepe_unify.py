"""Null section yjs_state again for Crepe + y-prosemirror unification."""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "f1e9d8c7b6a5"
down_revision: Union[str, Sequence[str], None] = "z9a8b7c6d5e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE sections SET yjs_state = NULL WHERE yjs_state IS NOT NULL")


def downgrade() -> None:
    """One-way: cannot restore cleared Yjs blobs."""
