"""AdminService.test_embedding routing vs scoped registry probe."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.auth import AdminEmbeddingProbeBody


def test_admin_embedding_probe_body_requires_provider_and_model_together() -> None:
    with pytest.raises(ValidationError):
        AdminEmbeddingProbeBody(provider_id="openai", model=None)
    with pytest.raises(ValidationError):
        AdminEmbeddingProbeBody(provider_id=None, model="m")
    AdminEmbeddingProbeBody()
    AdminEmbeddingProbeBody(provider_id="openai", model="m")
