"""Merge alembic heads f1a2b3c4d5e6 and f8e9d0c1b2a3."""

revision = "0a1b2c3d4e5"
down_revision = ("f1a2b3c4d5e6", "f8e9d0c1b2a3")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
