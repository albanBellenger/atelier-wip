"""Embedding dimension singleton; drop admin_config."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "p7q8r9s0t1u2"
down_revision = "o1p2q3r4s5t6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "embedding_dimension_state",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("observed_dim", sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    bind = op.get_bind()
    dim = bind.execute(
        sa.text("SELECT embedding_dim FROM admin_config WHERE id = 1")
    ).scalar()
    bind.execute(
        sa.text(
            "INSERT INTO embedding_dimension_state (id, observed_dim) VALUES (:id, :d)"
        ),
        {"id": 1, "d": dim},
    )
    op.drop_table("admin_config")


def downgrade() -> None:
    op.create_table(
        "admin_config",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("embedding_provider", sa.String(length=64), nullable=True),
        sa.Column("embedding_model", sa.String(length=256), nullable=True),
        sa.Column("embedding_api_key", sa.Text(), nullable=True),
        sa.Column("embedding_api_base_url", sa.Text(), nullable=True),
        sa.Column("embedding_dim", sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    bind = op.get_bind()
    dim = bind.execute(
        sa.text("SELECT observed_dim FROM embedding_dimension_state WHERE id = 1")
    ).scalar()
    bind.execute(
        sa.text(
            "INSERT INTO admin_config (id, embedding_provider, embedding_model, "
            "embedding_api_key, embedding_api_base_url, embedding_dim) "
            "VALUES (1, NULL, NULL, NULL, NULL, :d)"
        ),
        {"d": dim},
    )
    op.drop_table("embedding_dimension_state")
