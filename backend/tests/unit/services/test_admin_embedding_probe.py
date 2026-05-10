"""AdminService.test_embedding routing vs scoped registry probe."""

from __future__ import annotations

import json
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from pydantic import ValidationError
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import LlmProviderRegistry, LlmRoutingRule
from app.schemas.auth import AdminEmbeddingProbeBody
from app.security.field_encryption import encode_admin_stored_secret
from app.services.admin_service import AdminService
from app.services.embedding_service import EmbeddingService


def test_admin_embedding_probe_body_requires_provider_and_model_together() -> None:
    with pytest.raises(ValidationError):
        AdminEmbeddingProbeBody(provider_id="openai", model=None)
    with pytest.raises(ValidationError):
        AdminEmbeddingProbeBody(provider_id=None, model="m")
    AdminEmbeddingProbeBody()
    AdminEmbeddingProbeBody(provider_id="openai", model="m")


@pytest.mark.asyncio
async def test_test_embedding_scoped_ok(db_session: AsyncSession) -> None:
    await db_session.execute(delete(LlmRoutingRule))
    await db_session.execute(delete(LlmProviderRegistry))
    await db_session.flush()
    db_session.add(
        LlmProviderRegistry(
            id=uuid.uuid4(),
            provider_id="openai",
            models_json=json.dumps(
                [{"id": "text-embedding-3-small", "kind": "embedding"}]
            ),
            api_base_url=None,
            logo_url=None,
            status="connected",
            is_default=True,
            sort_order=0,
            api_key=encode_admin_stored_secret("sk-test"),
            litellm_provider_slug="openai",
        )
    )
    await db_session.flush()

    with patch.object(
        EmbeddingService,
        "probe_registry_embedding_model",
        new_callable=AsyncMock,
        return_value=[[0.01] * 1536],
    ):
        out = await AdminService(db_session).test_embedding(
            AdminEmbeddingProbeBody(provider_id="openai", model="text-embedding-3-small")
        )
    assert out.ok is True
    assert "1536 dimensions" in out.message
