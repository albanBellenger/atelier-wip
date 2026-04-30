"""rename graph_edges edge_type depends -> depends_on (align with schema docs)."""

from typing import Sequence, Union

from alembic import op

revision: str = "e8f1a2b3c4d5"
down_revision: Union[str, Sequence[str], None] = "c7f9e2a1b4d8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "UPDATE graph_edges SET edge_type = 'depends_on' WHERE edge_type = 'depends'"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE graph_edges SET edge_type = 'depends' WHERE edge_type = 'depends_on'"
    )
