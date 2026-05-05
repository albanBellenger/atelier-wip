"""Unit tests for LLM registry credential resolution."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.exceptions import ApiError
from app.models import AdminConfig, LlmProviderRegistry
from app.services.llm_registry_credentials import (
    assert_openai_compatible_provider_field,
    resolve_openai_compatible_llm_credentials,
    resolve_provider_key_for_model,
)


def test_assert_openai_compatible_rejects_non_openai_label() -> None:
    admin = AdminConfig(id=1, llm_provider="anthropic")
    with pytest.raises(ApiError) as ei:
        assert_openai_compatible_provider_field(admin)
    assert ei.value.error_code == "LLM_PROVIDER_UNSUPPORTED"


@pytest.mark.asyncio
async def test_resolve_provider_key_for_model_ordered() -> None:
    db = AsyncMock()
    openai_row = LlmProviderRegistry(
        id=uuid4(),
        provider_key="openai",
        display_name="OpenAI",
        models_json='["gpt-4o-mini"]',
        api_base_url=None,
        logo_url=None,
        status="connected",
        is_default=False,
        sort_order=0,
        api_key=None,
    )
    other = LlmProviderRegistry(
        id=uuid4(),
        provider_key="z_other",
        display_name="Z",
        models_json='["gpt-4o-mini"]',
        api_base_url=None,
        logo_url=None,
        status="connected",
        is_default=False,
        sort_order=1,
        api_key=None,
    )

    exec_result = MagicMock()
    exec_result.scalars = MagicMock(return_value=MagicMock(all=lambda: [openai_row, other]))
    db.execute = AsyncMock(return_value=exec_result)

    pk = await resolve_provider_key_for_model(db, "gpt-4o-mini")
    assert pk == "openai"


@pytest.mark.asyncio
async def test_resolve_credentials_prefers_registry_row_when_present(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def _decode(stored: str | None) -> str | None:
        if stored == "reg_cipher":
            return "from-registry"
        if stored == "global_cipher":
            return "from-global"
        return None

    monkeypatch.setattr(
        "app.services.llm_registry_credentials.decode_admin_stored_secret",
        _decode,
    )

    db = AsyncMock()
    reg = LlmProviderRegistry(
        id=uuid4(),
        provider_key="acme",
        display_name="Acme",
        models_json='["m1"]',
        api_base_url="https://api.acme.example/v1",
        logo_url=None,
        status="connected",
        is_default=False,
        sort_order=0,
        api_key="reg_cipher",
    )
    db.scalar = AsyncMock(return_value=reg)
    admin = AdminConfig(
        id=1,
        llm_provider="openai",
        llm_api_key="global_cipher",
        llm_api_base_url="https://api.openai.com/v1",
    )

    model, key, url = await resolve_openai_compatible_llm_credentials(
        db,
        admin=admin,
        effective_model="m1",
        route_provider_key="acme",
    )
    assert model == "m1"
    assert key == "from-registry"
    assert "acme.example" in url


@pytest.mark.asyncio
async def test_resolve_credentials_fallback_global_when_registry_row_has_no_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def _decode(stored: str | None) -> str | None:
        if stored == "global_cipher":
            return "from-global"
        return None

    monkeypatch.setattr(
        "app.services.llm_registry_credentials.decode_admin_stored_secret",
        _decode,
    )
    db = AsyncMock()
    reg = LlmProviderRegistry(
        id=uuid4(),
        provider_key="acme",
        display_name="Acme",
        models_json='["m1"]',
        api_base_url=None,
        logo_url=None,
        status="connected",
        is_default=False,
        sort_order=0,
        api_key=None,
    )
    db.scalar = AsyncMock(return_value=reg)
    admin = AdminConfig(
        id=1,
        llm_provider="openai",
        llm_api_key="global_cipher",
        llm_api_base_url=None,
    )

    model, key, _url = await resolve_openai_compatible_llm_credentials(
        db,
        admin=admin,
        effective_model="m1",
        route_provider_key="acme",
    )
    assert model == "m1"
    assert key == "from-global"
