"""admin_config: optional OpenAI-compatible API base URLs

Revision ID: a1b2c3d4e5f6
Revises: 938ecbad8160
Create Date: 2026-04-30

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "938ecbad8160"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "admin_config",
        sa.Column("llm_api_base_url", sa.Text(), nullable=True),
    )
    op.add_column(
        "admin_config",
        sa.Column("embedding_api_base_url", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("admin_config", "embedding_api_base_url")
    op.drop_column("admin_config", "llm_api_base_url")
