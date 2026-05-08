"""Rename token_usage.call_type to call_source."""

from __future__ import annotations

from alembic import op

revision = "o1p2q3r4s5t6"
down_revision = "n4o5p6q7r8s9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute('ALTER TABLE token_usage RENAME COLUMN call_type TO call_source')


def downgrade() -> None:
    op.execute('ALTER TABLE token_usage RENAME COLUMN call_source TO call_type')
