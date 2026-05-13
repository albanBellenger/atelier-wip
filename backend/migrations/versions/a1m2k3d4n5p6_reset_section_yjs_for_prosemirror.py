"""Null section yjs_state for ProseMirror (Milkdown) migration; content remains."""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "a1m2k3d4n5p6"
down_revision: Union[str, Sequence[str], None] = "w1x2y3z4a5b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE sections SET yjs_state = NULL WHERE yjs_state IS NOT NULL")


def downgrade() -> None:
    """One-way: legacy CodeMirror blobs cannot be restored from this migration."""
    pass
