"""LlmConnectivityService upsert derives registry status (system-controlled)."""

from __future__ import annotations

import json
import uuid

import pytest
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import LlmProviderRegistry
from app.schemas.admin_console import LlmProviderRegistryUpdate
from app.schemas.llm_registry_model import LlmRegistryModelEntry
from app.security.field_encryption import encode_admin_stored_secret
from app.services.llm_connectivity_service import LlmConnectivityService


@pytest.mark.asyncio
async def test_create_provider_always_needs_key(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await db_session.execute(delete(LlmProviderRegistry))
    await db_session.flush()

    async def _noop(self: object, **_k: object):
        from app.schemas.auth import AdminConnectivityResult

        return AdminConnectivityResult(ok=True, message="ok", detail=None)

    monkeypatch.setattr(
        "app.services.llm_connectivity_service.LLMService.admin_connectivity_probe",
        _noop,
    )
    monkeypatch.setattr(
        "app.services.llm_connectivity_service.enrich_model_entries_from_litellm",
        lambda entries, draft_registry_row: list(entries),
    )

    body = LlmProviderRegistryUpdate(
        models=[
            LlmRegistryModelEntry(id="m1", context_metadata_source="unknown"),
        ],
        llm_api_key="sk-test",
    )
    out = await LlmConnectivityService(db_session).upsert_provider("acme", body)
    assert out.status == "needs-key"
    row = (
        await db_session.execute(
            select(LlmProviderRegistry).where(LlmProviderRegistry.provider_id == "acme")
        )
    ).scalar_one()
    assert row.status == "needs-key"


@pytest.mark.asyncio
async def test_update_material_change_downgrades_connected(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await db_session.execute(delete(LlmProviderRegistry))
    await db_session.flush()
    rid = uuid.uuid4()
    db_session.add(
        LlmProviderRegistry(
            id=rid,
            provider_id="acme",
            models_json=json.dumps(["old"]),
            api_base_url=None,
            logo_url=None,
            status="connected",
            is_default=False,
            sort_order=0,
            api_key=encode_admin_stored_secret("sk-test"),
            litellm_provider_slug=None,
        )
    )
    await db_session.flush()

    async def _noop(self: object, **_k: object):
        from app.schemas.auth import AdminConnectivityResult

        return AdminConnectivityResult(ok=True, message="ok", detail=None)

    monkeypatch.setattr(
        "app.services.llm_connectivity_service.LLMService.admin_connectivity_probe",
        _noop,
    )
    monkeypatch.setattr(
        "app.services.llm_connectivity_service.enrich_model_entries_from_litellm",
        lambda entries, draft_registry_row: list(entries),
    )

    body = LlmProviderRegistryUpdate(
        models=[
            LlmRegistryModelEntry(id="new-model", context_metadata_source="unknown"),
        ],
    )
    out = await LlmConnectivityService(db_session).upsert_provider("acme", body)
    assert out.status == "needs-key"


@pytest.mark.asyncio
async def test_update_disabled_true_sets_disabled(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await db_session.execute(delete(LlmProviderRegistry))
    await db_session.flush()
    db_session.add(
        LlmProviderRegistry(
            id=uuid.uuid4(),
            provider_id="acme",
            models_json=json.dumps(["m"]),
            api_base_url=None,
            logo_url=None,
            status="connected",
            is_default=False,
            sort_order=0,
            api_key=encode_admin_stored_secret("sk-test"),
            litellm_provider_slug=None,
        )
    )
    await db_session.flush()

    async def _noop(self: object, **_k: object):
        from app.schemas.auth import AdminConnectivityResult

        return AdminConnectivityResult(ok=True, message="ok", detail=None)

    monkeypatch.setattr(
        "app.services.llm_connectivity_service.LLMService.admin_connectivity_probe",
        _noop,
    )
    monkeypatch.setattr(
        "app.services.llm_connectivity_service.enrich_model_entries_from_litellm",
        lambda entries, draft_registry_row: list(entries),
    )

    body = LlmProviderRegistryUpdate(
        models=[
            LlmRegistryModelEntry(id="m", context_metadata_source="unknown"),
        ],
        disabled=True,
    )
    out = await LlmConnectivityService(db_session).upsert_provider("acme", body)
    assert out.status == "disabled"


@pytest.mark.asyncio
async def test_update_disabled_false_sets_needs_key(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await db_session.execute(delete(LlmProviderRegistry))
    await db_session.flush()
    db_session.add(
        LlmProviderRegistry(
            id=uuid.uuid4(),
            provider_id="acme",
            models_json=json.dumps(["m"]),
            api_base_url=None,
            logo_url=None,
            status="disabled",
            is_default=False,
            sort_order=0,
            api_key=encode_admin_stored_secret("sk-test"),
            litellm_provider_slug=None,
        )
    )
    await db_session.flush()

    async def _noop(self: object, **_k: object):
        from app.schemas.auth import AdminConnectivityResult

        return AdminConnectivityResult(ok=True, message="ok", detail=None)

    monkeypatch.setattr(
        "app.services.llm_connectivity_service.LLMService.admin_connectivity_probe",
        _noop,
    )
    monkeypatch.setattr(
        "app.services.llm_connectivity_service.enrich_model_entries_from_litellm",
        lambda entries, draft_registry_row: list(entries),
    )

    body = LlmProviderRegistryUpdate(
        models=[
            LlmRegistryModelEntry(id="m", context_metadata_source="unknown"),
        ],
        disabled=False,
    )
    out = await LlmConnectivityService(db_session).upsert_provider("acme", body)
    assert out.status == "needs-key"
