"""Project archived flag + software_activity_events."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "a2b3c4d5e6f7"
down_revision = "b1c2d3e4f5a6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column(
            "archived",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )
    op.create_index("ix_projects_software_archived", "projects", ["software_id", "archived"])

    op.create_table(
        "software_activity_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "software_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("software.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "studio_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("studios.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "actor_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("verb", sa.String(64), nullable=False),
        sa.Column("entity_type", sa.String(64), nullable=True),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_software_activity_software_created",
        "software_activity_events",
        ["software_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_software_activity_software_created", table_name="software_activity_events")
    op.drop_table("software_activity_events")
    op.drop_index("ix_projects_software_archived", table_name="projects")
    op.drop_column("projects", "archived")
