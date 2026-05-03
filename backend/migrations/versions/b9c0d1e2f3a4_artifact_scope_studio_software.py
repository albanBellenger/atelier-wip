"""Artifact scope: studio/software library rows; nullable project_id."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "b9c0d1e2f3a4"
down_revision = "0a1b2c3d4e5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "artifacts",
        sa.Column(
            "scope_level",
            sa.String(16),
            server_default="project",
            nullable=False,
        ),
    )
    op.add_column(
        "artifacts",
        sa.Column(
            "library_studio_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
    )
    op.add_column(
        "artifacts",
        sa.Column(
            "library_software_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
    )
    op.create_foreign_key(
        "fk_artifacts_library_studio_id",
        "artifacts",
        "studios",
        ["library_studio_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_artifacts_library_software_id",
        "artifacts",
        "software",
        ["library_software_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.alter_column(
        "artifacts",
        "project_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=True,
    )
    op.execute(
        """
        ALTER TABLE artifacts ADD CONSTRAINT ck_artifacts_scope_fks CHECK (
            (scope_level = 'project' AND project_id IS NOT NULL
             AND library_studio_id IS NULL AND library_software_id IS NULL)
            OR (scope_level = 'studio' AND project_id IS NULL
                AND library_studio_id IS NOT NULL AND library_software_id IS NULL)
            OR (scope_level = 'software' AND project_id IS NULL
                AND library_software_id IS NOT NULL AND library_studio_id IS NOT NULL)
        )
        """
    )


def downgrade() -> None:
    op.drop_constraint("ck_artifacts_scope_fks", "artifacts", type_="check")
    op.alter_column(
        "artifacts",
        "project_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=False,
    )
    op.drop_constraint("fk_artifacts_library_software_id", "artifacts", type_="foreignkey")
    op.drop_constraint("fk_artifacts_library_studio_id", "artifacts", type_="foreignkey")
    op.drop_column("artifacts", "library_software_id")
    op.drop_column("artifacts", "library_studio_id")
    op.drop_column("artifacts", "scope_level")
