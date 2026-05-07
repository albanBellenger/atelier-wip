"""Drop LLM columns from admin_config; seed llm_provider_registry from legacy row."""

from __future__ import annotations

import json
import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text

revision = "m2n3o4p5q6r7"
down_revision = "l9m0n1p2q3r4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    row = bind.execute(
        text(
            "SELECT llm_provider, llm_model, llm_api_key, llm_api_base_url "
            "FROM admin_config WHERE id = 1"
        )
    ).fetchone()
    if row is None:
        pass
    else:
        llm_provider, llm_model, llm_api_key, llm_api_base_url = row
        if llm_model is not None and str(llm_model).strip():
            pk = (str(llm_provider).strip().lower() if llm_provider else "openai") or "openai"
            exists = bind.execute(
                text(
                    "SELECT 1 FROM llm_provider_registry "
                    "WHERE lower(trim(provider_key)) = lower(trim(:pk)) LIMIT 1"
                ),
                {"pk": pk},
            ).fetchone()
            if exists is None:
                bind.execute(text("UPDATE llm_provider_registry SET is_default = false"))
                models_json = json.dumps([str(llm_model).strip()])
                display_name = "Legacy admin config"
                new_id = str(uuid.uuid4())
                base_url = llm_api_base_url
                if base_url is not None and len(str(base_url)) > 512:
                    base_url = str(base_url)[:512]
                bind.execute(
                    text(
                        """
                        INSERT INTO llm_provider_registry (
                            id, provider_key, display_name, models_json,
                            api_base_url, logo_url, status, is_default, sort_order,
                            api_key, litellm_provider_slug
                        ) VALUES (
                            CAST(:id AS uuid), :provider_key, :display_name, :models_json,
                            :api_base_url, NULL, 'connected', true, 0,
                            :api_key, NULL
                        )
                        """
                    ),
                    {
                        "id": new_id,
                        "provider_key": pk[:64],
                        "display_name": display_name[:255],
                        "models_json": models_json,
                        "api_base_url": base_url,
                        "api_key": llm_api_key,
                    },
                )

    op.drop_column("admin_config", "llm_api_base_url")
    op.drop_column("admin_config", "llm_api_key")
    op.drop_column("admin_config", "llm_model")
    op.drop_column("admin_config", "llm_provider")


def downgrade() -> None:
    op.add_column(
        "admin_config",
        sa.Column("llm_provider", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "admin_config",
        sa.Column("llm_model", sa.String(length=256), nullable=True),
    )
    op.add_column(
        "admin_config",
        sa.Column("llm_api_key", sa.Text(), nullable=True),
    )
    op.add_column(
        "admin_config",
        sa.Column("llm_api_base_url", sa.Text(), nullable=True),
    )
