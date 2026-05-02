"""Add projects.publish_folder_slug (unique per software) for Git export paths."""

import uuid

import sqlalchemy as sa
from alembic import op

from app.services.publish_folder_slug import (
    PUBLISH_FOLDER_SLUG_MAX_LEN,
    slug_from_project_name,
)

revision = "f8e9d0c1b2a3"
down_revision = "e7f8a9b0c1d2"
branch_labels = None
depends_on = None


def _slug_with_numeric_suffix(base_slug: str, n: int) -> str:
    suffix = f"-{n}"
    root = base_slug[: PUBLISH_FOLDER_SLUG_MAX_LEN - len(suffix)].rstrip("-") or "p"
    return f"{root}{suffix}"


def _assign_unique_sync(
    used: set[str],
    base_slug: str,
) -> str:
    candidate = base_slug[:PUBLISH_FOLDER_SLUG_MAX_LEN].rstrip("-") or "project"
    n = 2
    while candidate in used:
        candidate = _slug_with_numeric_suffix(base_slug, n)
        n += 1
    used.add(candidate)
    return candidate


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column("publish_folder_slug", sa.String(128), nullable=True),
    )
    conn = op.get_bind()
    rows = conn.execute(
        sa.text("SELECT id, software_id, name FROM projects ORDER BY software_id, created_at")
    ).fetchall()
    by_sw: dict[uuid.UUID, set[str]] = {}
    for rid, software_id, name in rows:
        if not isinstance(software_id, uuid.UUID):
            software_id = uuid.UUID(str(software_id))
        used = by_sw.setdefault(software_id, set())
        base = slug_from_project_name(name or "project")
        slug = _assign_unique_sync(used, base)
        conn.execute(
            sa.text("UPDATE projects SET publish_folder_slug = :slug WHERE id = :id"),
            {"slug": slug, "id": rid},
        )
    op.alter_column("projects", "publish_folder_slug", nullable=False)
    op.create_unique_constraint(
        "uq_projects_software_publish_folder_slug",
        "projects",
        ["software_id", "publish_folder_slug"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_projects_software_publish_folder_slug",
        "projects",
        type_="unique",
    )
    op.drop_column("projects", "publish_folder_slug")
