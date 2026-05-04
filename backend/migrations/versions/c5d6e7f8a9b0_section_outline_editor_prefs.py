"""Section outline editor: per-user context preferences for RAG."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "c5d6e7f8a9b0"
down_revision = "b4c5d6e7f8a9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "section_context_preferences",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("section_id", UUID(as_uuid=True), nullable=False),
        sa.Column(
            "payload",
            JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["section_id"], ["sections.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "section_id", name="uq_section_ctx_prefs_user_section"),
    )
    op.create_index(
        "ix_section_context_preferences_section_id",
        "section_context_preferences",
        ["section_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_section_context_preferences_section_id", table_name="section_context_preferences")
    op.drop_table("section_context_preferences")
