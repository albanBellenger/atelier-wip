"""Rename llm_provider_registry / studio_llm_provider_policy columns to provider_id."""

from __future__ import annotations

from alembic import op

revision = "q8r9s0t1u2v3"
down_revision = "p7q8r9s0t1u2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE llm_provider_registry "
        "RENAME COLUMN provider_key TO provider_id"
    )
    op.execute(
        "ALTER TABLE studio_llm_provider_policy "
        "RENAME COLUMN provider_key TO provider_id"
    )
    op.execute(
        "ALTER TABLE llm_provider_registry RENAME CONSTRAINT "
        "uq_llm_provider_registry_provider_key "
        "TO uq_llm_provider_registry_provider_id"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE llm_provider_registry RENAME CONSTRAINT "
        "uq_llm_provider_registry_provider_id "
        "TO uq_llm_provider_registry_provider_key"
    )
    op.execute(
        "ALTER TABLE studio_llm_provider_policy "
        "RENAME COLUMN provider_id TO provider_key"
    )
    op.execute(
        "ALTER TABLE llm_provider_registry "
        "RENAME COLUMN provider_id TO provider_key"
    )
