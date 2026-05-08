"""Unit tests for LLM registry credential resolution."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.exceptions import ApiError
from app.models import LlmProviderRegistry
from app.services.llm_registry_credentials import (
    get_default_llm_registry_row,
    resolve_openai_compatible_llm_credentials,
    resolve_provider_key_for_model,
)


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
async def test_resolve_credentials_uses_registry_row_key_when_present(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def _decode(stored: str | None) -> str | None:
        if stored == "reg_cipher":
            return "from-registry"
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

    model, key, api_base, out_reg = await resolve_openai_compatible_llm_credentials(
        db,
        effective_model="m1",
        route_provider_key="acme",
    )
    assert model == "acme/m1"
    assert key == "from-registry"
    assert "acme.example" in api_base
    assert out_reg is reg


@pytest.mark.asyncio
async def test_resolve_raises_llm_not_configured_when_registry_row_has_no_api_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.services.llm_registry_credentials.decode_admin_stored_secret",
        lambda _s: None,
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

    with pytest.raises(ApiError) as ei:
        await resolve_openai_compatible_llm_credentials(
            db,
            effective_model="m1",
            route_provider_key="acme",
        )
    assert ei.value.error_code == "LLM_NOT_CONFIGURED"


@pytest.mark.asyncio
async def test_resolve_raises_when_route_provider_unknown(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.services.llm_registry_credentials.decode_admin_stored_secret",
        lambda _s: "k",
    )
    db = AsyncMock()
    db.scalar = AsyncMock(return_value=None)

    with pytest.raises(ApiError) as ei:
        await resolve_openai_compatible_llm_credentials(
            db,
            effective_model="m1",
            route_provider_key="missing",
        )
    assert ei.value.error_code == "LLM_NOT_CONFIGURED"


@pytest.mark.asyncio
async def test_resolve_uses_default_row_when_route_provider_key_none(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def _decode(stored: str | None) -> str | None:
        if stored == "def_cipher":
            return "default-key"
        return None

    monkeypatch.setattr(
        "app.services.llm_registry_credentials.decode_admin_stored_secret",
        _decode,
    )

    default_row = LlmProviderRegistry(
        id=uuid4(),
        provider_key="openai",
        display_name="OpenAI",
        models_json='["gpt-4o-mini"]',
        api_base_url=None,
        logo_url=None,
        status="connected",
        is_default=True,
        sort_order=0,
        api_key="def_cipher",
    )

    db = AsyncMock()

    async def fake_default(_db: AsyncMock) -> LlmProviderRegistry:
        return default_row

    monkeypatch.setattr(
        "app.services.llm_registry_credentials.get_default_llm_registry_row",
        fake_default,
    )

    model, key, _base, out_reg = await resolve_openai_compatible_llm_credentials(
        db,
        effective_model="gpt-4o-mini",
        route_provider_key=None,
    )
    assert key == "default-key"
    assert "gpt-4o-mini" in model or model == "gpt-4o-mini"
    assert out_reg is default_row


@pytest.mark.asyncio
async def test_get_default_llm_registry_row_returns_query_scalar() -> None:
    want = LlmProviderRegistry(
        id=uuid4(),
        provider_key="b",
        display_name="B",
        models_json="[]",
        api_base_url=None,
        logo_url=None,
        status="connected",
        is_default=True,
        sort_order=0,
        api_key=None,
    )
    exec_result = MagicMock()
    exec_result.scalar_one_or_none = MagicMock(return_value=want)
    db = AsyncMock()
    db.execute = AsyncMock(return_value=exec_result)

    row = await get_default_llm_registry_row(db)
    assert row is want
