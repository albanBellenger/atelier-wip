"""Software-level shared chat messages (builder home composer thread)."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "a3b4c5d6e7f8"
down_revision = "f2a3b4c5d6e7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "software_chat_messages",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("software_id", UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), nullable=True),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["software_id"],
            ["software.id"],
            name="fk_software_chat_messages_software_id_software",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_software_chat_messages_user_id_users",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_software_chat_messages_software_created",
        "software_chat_messages",
        ["software_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_software_chat_messages_software_created",
        table_name="software_chat_messages",
    )
    op.drop_table("software_chat_messages")
