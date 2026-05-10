"""Normalize llm_provider_registry.is_default: connected-only, at most one row."""

from __future__ import annotations

from alembic import op

revision = "u2v3w4x5y6z7"
down_revision = "s0t1u2v3w4x5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE llm_provider_registry
        SET is_default = false
        WHERE LOWER(COALESCE(TRIM(status), '')) <> 'connected'
        """
    )
    op.execute(
        """
        UPDATE llm_provider_registry AS p
        SET is_default = false
        WHERE p.is_default = true
          AND p.id NOT IN (
            SELECT id FROM (
              SELECT id FROM llm_provider_registry
              WHERE is_default = true
              ORDER BY sort_order ASC, provider_id ASC
              LIMIT 1
            ) AS keeper
          )
        """
    )


def downgrade() -> None:
    pass
