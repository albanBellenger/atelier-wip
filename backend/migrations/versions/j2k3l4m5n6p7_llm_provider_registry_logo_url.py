"""Add logo_url to llm_provider_registry."""

import sqlalchemy as sa
from alembic import op

revision = "j2k3l4m5n6p7"
down_revision = "i1j2k3l4m5n6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "llm_provider_registry",
        sa.Column("logo_url", sa.String(length=1024), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("llm_provider_registry", "logo_url")
