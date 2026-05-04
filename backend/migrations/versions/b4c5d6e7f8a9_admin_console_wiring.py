"""Admin console wiring: activity, studio budget/git, LLM policy, embeddings registry."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "b4c5d6e7f8a9"
down_revision = "a3b4c5d6e7f8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "deployment_activity",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("actor_user_id", UUID(as_uuid=True), nullable=True),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("target_type", sa.String(length=64), nullable=True),
        sa.Column("target_id", UUID(as_uuid=True), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("payload", JSONB(astext_type=sa.Text()), nullable=True),
        sa.ForeignKeyConstraint(
            ["actor_user_id"],
            ["users.id"],
            name="fk_deployment_activity_actor_user_id_users",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_deployment_activity_created_at",
        "deployment_activity",
        ["created_at"],
        unique=False,
    )

    op.add_column(
        "studios",
        sa.Column(
            "budget_cap_monthly_usd",
            sa.Numeric(precision=14, scale=2),
            nullable=True,
        ),
    )
    op.add_column(
        "studios",
        sa.Column("git_provider", sa.String(length=32), nullable=True),
    )
    op.add_column("studios", sa.Column("git_repo_url", sa.Text(), nullable=True))
    op.add_column("studios", sa.Column("git_token", sa.Text(), nullable=True))
    op.add_column(
        "studios",
        sa.Column("git_branch", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "studios",
        sa.Column("git_publish_strategy", sa.String(length=64), nullable=True),
    )

    op.execute(
        """
        UPDATE studios AS st
        SET
          git_provider = sw.git_provider,
          git_repo_url = sw.git_repo_url,
          git_token = sw.git_token,
          git_branch = sw.git_branch
        FROM (
          SELECT DISTINCT ON (studio_id)
            studio_id,
            git_provider,
            git_repo_url,
            git_token,
            git_branch
          FROM software
          ORDER BY studio_id, created_at ASC
        ) AS sw
        WHERE st.id = sw.studio_id
        """
    )

    op.create_table(
        "llm_provider_registry",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("provider_key", sa.String(length=64), nullable=False),
        sa.Column("display_name", sa.String(length=255), nullable=False),
        sa.Column("models_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("region", sa.String(length=64), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="connected"),
        sa.Column(
            "is_default",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("key_preview", sa.String(length=64), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("provider_key", name="uq_llm_provider_registry_provider_key"),
    )

    op.create_table(
        "studio_llm_provider_policy",
        sa.Column("studio_id", UUID(as_uuid=True), nullable=False),
        sa.Column("provider_key", sa.String(length=64), nullable=False),
        sa.Column(
            "enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("selected_model", sa.String(length=256), nullable=True),
        sa.ForeignKeyConstraint(
            ["studio_id"],
            ["studios.id"],
            name="fk_studio_llm_policy_studio_id_studios",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("studio_id", "provider_key"),
    )

    op.create_table(
        "llm_routing_rule",
        sa.Column("use_case", sa.String(length=32), nullable=False),
        sa.Column("primary_model", sa.String(length=256), nullable=False),
        sa.Column("fallback_model", sa.String(length=256), nullable=True),
        sa.PrimaryKeyConstraint("use_case"),
    )

    op.create_table(
        "embedding_model_registry",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("model_id", sa.String(length=256), nullable=False),
        sa.Column("provider_name", sa.String(length=128), nullable=False),
        sa.Column("dim", sa.Integer(), nullable=False),
        sa.Column("cost_per_million_usd", sa.Numeric(precision=12, scale=6), nullable=True),
        sa.Column("region", sa.String(length=64), nullable=True),
        sa.Column("default_role", sa.String(length=32), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("model_id", name="uq_embedding_model_registry_model_id"),
    )

    op.create_table(
        "embedding_reindex_policy",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("auto_reindex_trigger", sa.String(length=64), nullable=False),
        sa.Column("debounce_seconds", sa.Integer(), nullable=False),
        sa.Column("drift_threshold_pct", sa.Numeric(precision=6, scale=2), nullable=False),
        sa.Column("retention_days", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.execute(
        """
        INSERT INTO embedding_reindex_policy (
          id, auto_reindex_trigger, debounce_seconds, drift_threshold_pct, retention_days
        ) VALUES (
          1, 'on_document_change', 300, 5.00, 90
        )
        """
    )


def downgrade() -> None:
    op.drop_table("embedding_reindex_policy")
    op.drop_table("embedding_model_registry")
    op.drop_table("llm_routing_rule")
    op.drop_table("studio_llm_provider_policy")
    op.drop_table("llm_provider_registry")
    op.drop_column("studios", "git_publish_strategy")
    op.drop_column("studios", "git_branch")
    op.drop_column("studios", "git_token")
    op.drop_column("studios", "git_repo_url")
    op.drop_column("studios", "git_provider")
    op.drop_column("studios", "budget_cap_monthly_usd")
    op.drop_index("ix_deployment_activity_created_at", table_name="deployment_activity")
    op.drop_table("deployment_activity")
